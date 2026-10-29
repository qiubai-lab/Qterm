//! Probe-only ownership of initialized contexts, on CEF's UI thread.
use super::request_context::RequestContextInitContinuation;
use cef::RequestContext;
use std::{cell::RefCell, collections::HashMap, path::PathBuf};

struct Entry {
  context: RequestContext,
  ready: bool,
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

pub(crate) fn insert(key: PathBuf, context: RequestContext) {
  assert_ui_thread();
  POOL.with(|pool| {
    let previous = pool.borrow_mut().insert(
      key,
      Entry {
        context,
        ready: false,
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
  println!(
    "PROBE {}",
    serde_json::json!({"event":"context_pool_released","count":count})
  );
}
