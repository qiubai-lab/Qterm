//! Explicit host opt-in for Alloy child popups. No guest IPC or URL replay.
use cef::*;
use std::{cell::RefCell, collections::HashMap, sync::Arc};

#[derive(Clone)]
pub enum Event {
  Created { browser: Browser, parent: i32, url: String },
  Frame(crate::FrameEvent),
  Title { id: i32, title: String },
  Closed { id: i32 },
}
type Handler = Arc<dyn Fn(Event) + Send + Sync>;
#[derive(Clone)]
struct Owner { root: i32, handler: Handler }
struct Pending { owner: Owner, parent: i32, url: String }
#[derive(Default)]
struct Registry {
  roots: HashMap<i32, Owner>,
  children: HashMap<i32, Owner>,
  pending: HashMap<usize, Pending>,
}
thread_local! { static REGISTRY: RefCell<Registry> = RefCell::default(); }
fn owner(id: i32) -> Option<Owner> {
  REGISTRY.with(|r| { let r = r.borrow(); r.roots.get(&id).or_else(|| r.children.get(&id)).cloned() })
}
/// Call on CEF UI thread before the root is externally navigated.
pub fn register(browser: &Browser, handler: impl Fn(Event) + Send + Sync + 'static) -> Result<(), String> {
  if currently_on(ThreadId::UI) == 0 { return Err("popup registration requires CEF UI thread".into()); }
  if browser.is_valid() == 0 || browser.is_popup() != 0 { return Err("invalid popup root".into()); }
  REGISTRY.with(|r| r.borrow_mut().roots.insert(browser.identifier(), Owner { root: browser.identifier(), handler: Arc::new(handler) }));
  Ok(())
}
pub(crate) fn contains(id: i32) -> bool { REGISTRY.with(|r| r.borrow().children.contains_key(&id)) }
pub(crate) fn prepare(browser: &Browser, request: &crate::popup::PopupRequest, url: &str, info: Option<&mut WindowInfo>) -> bool {
  let Some(owner) = owner(browser.identifier()) else { return true; };
  #[cfg(target_os = "macos")]
  {
    use objc2::{rc::Retained, runtime::AnyObject};
    use objc2_app_kit::NSView;
    let Some(info) = info else { return false; };
    let Some(host) = browser.host() else { return false; };
    let Some(view) = (unsafe { Retained::<NSView>::retain(host.window_handle().cast()) }) else { return false; };
    let Some(parent) = (unsafe { view.superview() }) else { return false; };
    info.parent_view = Retained::as_ptr(&parent) as *mut AnyObject as _;
    info.view = std::ptr::null_mut();
    info.hidden = 1;
    info.bounds = Rect { x: -10000, y: -10000, width: 800, height: 560 };
    info.runtime_style = RuntimeStyle::ALLOY;
  }
  #[cfg(windows)]
  {
    use windows::Win32::UI::WindowsAndMessaging::{GetParent, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS};
    let Some(info) = info else { return false; };
    let Some(host) = browser.host() else { return false; };
    let Ok(parent) = (unsafe { GetParent(windows::Win32::Foundation::HWND(host.window_handle().0.cast())) }) else { return false; };
    info.parent_window = cef::sys::HWND(parent.0.cast());
    info.window = cef::sys::HWND(std::ptr::null_mut());
    info.style = (WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS).0;
    info.ex_style = 0;
    info.bounds = Rect { x: -10000, y: -10000, width: 800, height: 560 };
    info.runtime_style = RuntimeStyle::ALLOY;
  }
  #[cfg(not(any(target_os = "macos", windows)))]
  { let _ = (info, request, url, owner); return false; }
  REGISTRY.with(|r| r.borrow_mut().pending.insert(request.context_pool_key(), Pending { owner, parent: browser.identifier(), url: url.into() }));
  true
}
pub(crate) fn aborted(key: usize) { REGISTRY.with(|r| r.borrow_mut().pending.remove(&key)); }
pub(crate) fn created(browser: &Browser, request: &crate::popup::PopupRequest) {
  let pending = REGISTRY.with(|r| r.borrow_mut().pending.remove(&request.context_pool_key()));
  if let Some(pending) = pending {
    REGISTRY.with(|r| r.borrow_mut().children.insert(browser.identifier(), pending.owner.clone()));
    (pending.owner.handler)(Event::Created { browser: browser.clone(), parent: pending.parent, url: pending.url });
  }
}
pub(crate) fn frame(event: crate::FrameEvent) {
  if contains(event.browser_id) && let Some(owner) = owner(event.browser_id) { (owner.handler)(Event::Frame(event)); }
}
pub(crate) fn title(id: i32, title: String) {
  if contains(id) && let Some(owner) = owner(id) { (owner.handler)(Event::Title { id, title }); }
}
pub(crate) fn closed(id: i32) {
  let owner = REGISTRY.with(|r| { let mut r = r.borrow_mut(); r.pending.retain(|_, pending| pending.owner.root != id); r.children.remove(&id).or_else(|| r.roots.remove(&id)) });
  if let Some(owner) = owner { (owner.handler)(Event::Closed { id }); }
}

/// Complete the accepted native close without sending WM_CLOSE to the shared main window.
#[cfg(windows)]
pub(crate) fn destroy_windows_popup(browser: &Browser) {
  use windows::Win32::{Foundation::HWND, UI::WindowsAndMessaging::{DestroyWindow, GetParent, GetWindowLongW, GWL_STYLE, WS_CHILD}};
  if browser.is_valid() == 0 || !contains(browser.identifier()) { return; }
  let Some(host) = browser.host() else { return; };
  let hwnd = HWND(host.window_handle().0.cast());
  unsafe {
    if GetWindowLongW(hwnd, GWL_STYLE) as u32 & WS_CHILD.0 != 0 && GetParent(hwnd).is_ok() {
      let _ = DestroyWindow(hwnd);
    }
  }
}
