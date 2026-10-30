//! Per-webview DevTools requests with bounded response lifetime, inaccessible from guest IPC.
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri_runtime_cef::{DevToolsProtocol, WebviewCefExt, allocate_devtools_message_id};
type Pending = Arc<Mutex<HashMap<i32, tokio::sync::oneshot::Sender<Result<Value, String>>>>>;
struct PendingCall {
    id: i32,
    requests: Pending,
}
impl Drop for PendingCall {
    fn drop(&mut self) {
        self.requests
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.id);
    }
}
#[derive(Clone, Default)]
pub(super) struct Protocol(Pending);
impl Protocol {
    pub fn install(view: &tauri::Webview) -> Result<Self, String> {
        let protocol = Self::default();
        let pending = protocol.0.clone();
        view.on_dev_tools_protocol(move |event| {
            if let DevToolsProtocol::MethodResult {
                message_id,
                success,
                result,
            } = event
            {
                let sender = pending
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&message_id);
                if let Some(send) = sender {
                    let value = serde_json::from_slice(&result).map_err(|e| e.to_string());
                    let _ = send.send(if success {
                        value
                    } else {
                        Err(format!(
                            "CEF 操作被拒绝: {}",
                            String::from_utf8_lossy(&result)
                        ))
                    });
                }
            }
        })
        .map_err(|e| e.to_string())?;
        Ok(protocol)
    }
    pub async fn call(
        &self,
        view: &tauri::Webview,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        let id = allocate_devtools_message_id().map_err(|e| e.to_string())?;
        let (send, receive) = tokio::sync::oneshot::channel();
        self.0.lock().map_err(|e| e.to_string())?.insert(id, send);
        let _pending = PendingCall {
            id,
            requests: self.0.clone(),
        };
        let dispatched = view.send_dev_tools_message(
            json!({"id":id,"method":method,"params":params})
                .to_string()
                .as_bytes(),
        );
        match dispatched {
            Ok(()) => tokio::time::timeout(std::time::Duration::from_secs(15), receive)
                .await
                .map_err(|_| "CEF 命令超时".to_owned())
                .and_then(|v| v.map_err(|_| "网页已关闭".to_owned()))
                .and_then(|v| v),
            Err(e) => Err(e.to_string()),
        }
    }
}
