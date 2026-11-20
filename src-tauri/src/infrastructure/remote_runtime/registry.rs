//! A desktop attachment owns one upstream origin, cookie jar and cancellation lifetime.
use super::{ConnectionInfo, RemoteRuntime, endpoint};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{Mutex, OnceCell};
use tokio_util::sync::CancellationToken;

struct Slot {
    endpoint: reqwest::Url,
    cancel: CancellationToken,
    runtime: OnceCell<Arc<RemoteRuntime>>,
}

#[derive(Default)]
pub struct RemoteRuntimeRegistry {
    slots: Mutex<HashMap<String, Arc<Slot>>>,
}

impl RemoteRuntimeRegistry {
    pub async fn connect(
        &self,
        id: &str,
        address: &str,
        origin: String,
    ) -> Result<ConnectionInfo, String> {
        let target = endpoint(address)?;
        let slot = {
            let mut slots = self.slots.lock().await;
            let slot = slots.entry(id.to_owned()).or_insert_with(|| {
                Arc::new(Slot {
                    endpoint: target.clone(),
                    cancel: CancellationToken::new(),
                    runtime: OnceCell::new(),
                })
            });
            if slot.endpoint != target {
                return Err("连接地址已更改，请先断开原连接".into());
            }
            slot.clone()
        };
        let result = tokio::select! {
            biased;
            _ = slot.cancel.cancelled() => return Err("连接已取消".into()),
            result = slot.runtime.get_or_try_init(|| RemoteRuntime::start(address, origin, slot.cancel.clone())) => result,
        };
        match result {
            Ok(runtime) if !slot.cancel.is_cancelled() => Ok(runtime.info()),
            Ok(_) => Err("连接已取消".into()),
            Err(error) => {
                let mut slots = self.slots.lock().await;
                if slots
                    .get(id)
                    .is_some_and(|current| Arc::ptr_eq(current, &slot))
                {
                    slots.remove(id);
                    slot.cancel.cancel();
                }
                Err(error)
            }
        }
    }

    pub async fn runtime(&self, id: &str) -> Result<Arc<RemoteRuntime>, String> {
        self.slots
            .lock()
            .await
            .get(id)
            .and_then(|slot| slot.runtime.get())
            .cloned()
            .ok_or_else(|| "远程连接已断开".into())
    }

    pub async fn disconnect(&self, id: &str) {
        let removed = self.slots.lock().await.remove(id);
        if let Some(slot) = removed {
            slot.cancel.cancel();
            if let Some(runtime) = slot.runtime.get() {
                runtime.downloads.clear().await;
            }
        }
    }
}
