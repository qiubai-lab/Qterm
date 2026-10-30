//! Per-webview DevTools requests with bounded response lifetime, inaccessible from guest IPC.
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri_runtime_cef::cef::*;
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
pub(super) struct Protocol(Pending, Arc<Mutex<Option<Registration>>>);
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
    pub async fn install_popup(app: &tauri::AppHandle, browser: Browser) -> Result<Self, String> {
        let protocol = Self::default();
        let pending = protocol.0.clone();
        let registration = super::native::on_ui(app, move || {
            let mut observer = PopupObserver::new(pending);
            browser
                .host()
                .ok_or("网页已关闭")?
                .add_dev_tools_message_observer(Some(&mut observer))
                .ok_or("无法监听弹窗".into())
        })
        .await?;
        *protocol.1.lock().map_err(|e| e.to_string())? = Some(registration);
        Ok(protocol)
    }
    pub async fn call_view(
        &self,
        view: &super::guest_view::View,
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
        let message = json!({"id":id,"method":method,"params":params}).to_string();
        view.with(move |browser| {
            let host = browser.host().ok_or("网页已关闭")?;
            if host.send_dev_tools_message(Some(message.as_bytes())) == 0 {
                return Err("CEF 命令发送失败".into());
            }
            Ok(())
        })
        .await?;
        tokio::time::timeout(std::time::Duration::from_secs(15), receive)
            .await
            .map_err(|_| "CEF 命令超时".to_owned())?
            .map_err(|_| "网页已关闭".to_owned())?
    }
    #[cfg(feature = "cef-integration-test")]
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

wrap_dev_tools_message_observer! {
    struct PopupObserver { pending: Pending }
    impl DevToolsMessageObserver {
        fn on_dev_tools_method_result(&self, _browser: Option<&mut Browser>, message_id: i32, success: i32, result: Option<&[u8]>) {
            let sender = self.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&message_id);
            if let Some(sender) = sender {
                let result = result.unwrap_or_default();
                let value = if success != 0 { serde_json::from_slice(result).map_err(|e| e.to_string()) }
                    else { Err(format!("CEF 操作被拒绝: {}", String::from_utf8_lossy(result))) };
                let _ = sender.send(value);
            }
        }
    }
}
