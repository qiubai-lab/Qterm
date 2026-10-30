//! Connection ownership of initialized contexts, on CEF's UI thread.
use super::request_context::RequestContextInitContinuation;
use cef::RequestContext;
use std::{cell::RefCell, collections::{HashMap, HashSet}, path::PathBuf, sync::{Arc, Weak, atomic::{AtomicBool, Ordering}}};

struct Entry {
  context: RequestContext,
  ready: bool,
  network: Arc<AtomicBool>,
  browsers: HashMap<i32, cef::Browser>,
  browser_families: HashMap<i32, u32>,
  pending_popups: HashMap<usize, (Weak<()>, u32)>,
  closing_roots: HashSet<i32>,
  waiting: Vec<RequestContextInitContinuation>,
}

thread_local! {
  static POOL: RefCell<HashMap<PathBuf, Entry>> = RefCell::new(HashMap::new());
}

fn assert_ui_thread() {
  assert_eq!(
    cef::currently_on(cef::sys::cef_thread_id_t::TID_UI.into()),
    1
  );
}

pub(crate) fn get(key: &PathBuf) -> Option<RequestContext> {
  assert_ui_thread();
  POOL.with(|pool| pool.borrow().get(key).map(|entry| entry.context.clone()))
}

pub(crate) fn insert(key: PathBuf, context: RequestContext, network: Arc<AtomicBool>) {
  assert_ui_thread();
  POOL.with(|pool| {
    let previous = pool.borrow_mut().insert(
      key,
      Entry {
        context,
        ready: false,
        network,
        browsers: HashMap::new(),
        browser_families: HashMap::new(),
        pending_popups: HashMap::new(),
        closing_roots: HashSet::new(),
        waiting: Vec::new(),
      },
    );
    assert!(
      previous.is_none(),
      "a context must be owned before initialization is pumped"
    );
  });
}

pub(crate) fn when_ready(key: &PathBuf, callback: RequestContextInitContinuation) {
  assert_ui_thread();
  let mut callback = Some(callback);
  let context = POOL.with(|pool| {
    let mut pool = pool.borrow_mut();
    let entry = pool.get_mut(key).expect("owned context");
    if entry.ready {
      Some(entry.context.clone())
    } else {
      entry.waiting.push(callback.take().unwrap());
      None
    }
  });
  // No RefCell borrow may survive callbacks: browser creation can reenter the loop.
  if let Some(context) = context {
    callback.unwrap()(Some(context));
  }
}

pub(crate) fn initialized(key: &PathBuf, succeeded: bool) -> Vec<RequestContextInitContinuation> {
  assert_ui_thread();
  POOL.with(|pool| {
    let mut pool = pool.borrow_mut();
    if !succeeded {
      return pool
        .remove(key)
        .map(|entry| entry.waiting)
        .unwrap_or_default();
    }
    let entry = pool.get_mut(key).expect("owned initializing context");
    entry.ready = true;
    std::mem::take(&mut entry.waiting)
  })
}

pub(crate) fn clear_before_shutdown() {
  assert_ui_thread();
  let entries = POOL.with(|pool| std::mem::take(&mut *pool.borrow_mut()));
  let count = entries.len();
  drop(entries);
  log::debug!("released {count} connection-owned CEF contexts before shutdown");
}

/// Caller must close every browser and flush its context before retiring the pool entry.
pub fn retire(key: &std::path::Path) -> Result<bool, String> {
  assert_ui_thread();
  let key = key.canonicalize().map_err(|e| e.to_string())?;
  POOL.with(|pool| {
    let mut pool = pool.borrow_mut();
    if let Some(entry) = pool.get_mut(&key) { entry.pending_popups.retain(|_, (request, _)| request.strong_count() > 0); }
    if pool.get(&key).is_some_and(|entry| !entry.ready || !entry.waiting.is_empty() || !entry.browsers.is_empty() || !entry.pending_popups.is_empty()) {
      return Err("request context still has initializing or live browsers".into());
    }
    Ok(pool.remove(&key).is_some())
  })
}

pub(crate) fn browser_created(browser: &cef::Browser, family: u32) {
  use cef::{ImplBrowser, ImplBrowserHost, ImplRequestContext};
  assert_ui_thread();
  if let Some(mut context) = browser.host().and_then(|host| host.request_context()) {
    POOL.with(|pool| {
      for entry in pool.borrow_mut().values_mut() {
        if entry.context.is_same(Some(&mut context)) == 1 { entry.browsers.insert(browser.identifier(), browser.clone()); entry.browser_families.insert(browser.identifier(), family); }
      }
    });
  }
}
pub(crate) fn browser_closed(id: i32) {
  assert_ui_thread();
  POOL.with(|pool| { for entry in pool.borrow_mut().values_mut() { entry.browsers.remove(&id); entry.browser_families.remove(&id); entry.closing_roots.remove(&id); } });
}
pub fn count() -> usize {
  assert_ui_thread();
  POOL.with(|pool| pool.borrow().len())
}

/// Recovery of an owned environment after interrupted browser creation. UI thread only.
pub fn owned(key: &std::path::Path) -> Result<Option<RequestContext>, String> {
  let key = key.canonicalize().map_err(|e| e.to_string())?;
  Ok(get(&key))
}

/// IO-thread resource requests share this gate with the UI-thread owner. A new
/// profile starts closed, including worker requests with no browser/frame.
pub fn set_network_enabled(key: &std::path::Path, enabled: bool) -> Result<(), String> {
  assert_ui_thread();
  let key = key.canonicalize().map_err(|e| e.to_string())?;
  POOL.with(|pool| {
    let pool = pool.borrow();
    let entry = pool.get(&key).ok_or("request context is not owned")?;
    entry.network.store(enabled, Ordering::SeqCst);
    Ok(())
  })
}

pub(crate) fn popup_pending(browser: &cef::Browser, key: usize, token: Weak<()>, family: u32) {
  use cef::{ImplBrowser, ImplBrowserHost, ImplRequestContext};
  assert_ui_thread();
  if let Some(mut context) = browser.host().and_then(|host| host.request_context()) {
    POOL.with(|pool| {
      for entry in pool.borrow_mut().values_mut() {
        if entry.context.is_same(Some(&mut context)) == 1 { entry.pending_popups.insert(key, (token.clone(), family)); }
      }
    });
  }
}
pub(crate) fn popup_finished(key: usize) {
  assert_ui_thread();
  POOL.with(|pool| { for entry in pool.borrow_mut().values_mut() { entry.pending_popups.remove(&key); } });
}

/// Final-owner cleanup retries late native popup creation. Never closes an OS
/// window, which Chromium may share between unrelated popup browser tabs.
pub fn close_browsers(key: &std::path::Path) -> Result<(), String> {
  use cef::{ImplBrowser, ImplBrowserHost};
  assert_ui_thread();
  let key = key.canonicalize().map_err(|e| e.to_string())?;
  let browsers = POOL.with(|pool| pool.borrow().get(&key).map(|entry| entry.browsers.values().cloned().collect::<Vec<_>>()).unwrap_or_default());
  for browser in browsers {
    if browser.is_valid() != 0 && let Some(host) = browser.host() { host.close_browser(1); }
  }
  Ok(())
}

// The root webview's process-unique ID is inherited by every popup client.
// It survives intermediate opener closure; native opener handles do not.
fn family_ids(entry: &Entry, root: i32) -> HashSet<i32> {
  let Some(family) = entry.browser_families.get(&root) else { return HashSet::new(); };
  entry.browser_families.iter().filter(|(_, value)| *value == family).map(|(id, _)| *id).collect()
}
pub(crate) fn popup_admitted(browser: &cef::Browser) -> bool {
  use cef::ImplBrowser;
  assert_ui_thread();
  POOL.with(|pool| pool.borrow().values().all(|entry| entry.closing_roots.iter().all(|root| !family_ids(entry, *root).contains(&browser.identifier()))))
}
/// Drain the entire root family, including descendants of already closed
/// intermediate popups and native creations which have not reached OnAfterCreated.
pub fn drain_popups(root: i32) -> Result<bool, String> {
  use cef::{ImplBrowser, ImplBrowserHost};
  assert_ui_thread();
  let (browsers, pending) = POOL.with(|pool| {
    let mut pool = pool.borrow_mut();
    let entry = pool.values_mut().find(|entry| entry.browsers.contains_key(&root)).ok_or("root browser is not owned")?;
    entry.closing_roots.insert(root);
    entry.pending_popups.retain(|_, (request, _)| request.strong_count() > 0);
    let ids = family_ids(entry, root);
    let family = entry.browser_families.get(&root);
    let pending = entry.pending_popups.values().any(|(_, value)| Some(value) == family);
    let browsers = entry.browsers.iter().filter(|(id,_)| **id != root && ids.contains(id)).map(|(_,b)|b.clone()).collect::<Vec<_>>();
    Ok::<_, String>((browsers, pending))
  })?;
  let drained = browsers.is_empty() && !pending;
  for browser in browsers {
    if browser.is_valid() != 0 && let Some(host) = browser.host() { host.close_browser(1); }
  }
  Ok(drained)
}
