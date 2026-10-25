//! COM deferrals stay on the WebView2 UI thread; only opaque IDs cross IPC.
use std::{cell::RefCell, collections::HashMap};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Deferral, ICoreWebView2Environment, ICoreWebView2NewWindowRequestedEventArgs,
};

pub(super) struct Pending {
    pub source: String,
    pub environment: ICoreWebView2Environment,
    pub args: ICoreWebView2NewWindowRequestedEventArgs,
    pub deferral: ICoreWebView2Deferral,
}
impl Drop for Pending {
    fn drop(&mut self) {
        unsafe {
            let _ = self.deferral.Complete();
        }
    }
}
thread_local! { static REQUESTS: RefCell<HashMap<String, Pending>> = RefCell::default(); }
pub(super) fn insert(request: Pending) -> Result<String, String> {
    REQUESTS.with(|requests| {
        let mut requests = requests.borrow_mut();
        if requests.len() >= 16
            || requests
                .values()
                .filter(|entry| entry.source == request.source)
                .count()
                >= 4
        {
            return Err("新窗口请求过多，请稍后重试".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        requests.insert(id.clone(), request);
        Ok(id)
    })
}
pub(super) fn take(id: &str) -> Option<Pending> {
    REQUESTS.with(|requests| requests.borrow_mut().remove(id))
}
pub(super) fn source(id: &str) -> Result<String, String> {
    REQUESTS.with(|requests| {
        requests
            .borrow()
            .get(id)
            .map(|entry| entry.source.clone())
            .ok_or_else(|| "新窗口请求已失效，请重新点击链接".into())
    })
}
pub(super) fn environment(id: &str) -> Result<ICoreWebView2Environment, String> {
    REQUESTS.with(|requests| {
        requests
            .borrow()
            .get(id)
            .map(|entry| entry.environment.clone())
            .ok_or_else(|| "新窗口请求已失效，请重新点击链接".into())
    })
}
pub(super) fn cancel_source(source: &str) {
    let removed = REQUESTS.with(|requests| {
        let mut requests = requests.borrow_mut();
        let ids: Vec<_> = requests
            .iter()
            .filter(|(_, entry)| entry.source == source)
            .map(|(id, _)| id.clone())
            .collect();
        ids.into_iter()
            .filter_map(|id| requests.remove(&id))
            .collect::<Vec<_>>()
    });
    drop(removed); // Completing a deferral may reenter WebView2; no RefCell borrow survives.
}
