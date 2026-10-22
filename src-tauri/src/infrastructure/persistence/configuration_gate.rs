//! Serializes the core repositories and multi-file merge commits within this process.
//! Reentrant only on the same thread; guards must never cross an await boundary.
use std::{
    cell::Cell,
    marker::PhantomData,
    rc::Rc,
    sync::{Mutex, MutexGuard},
};
static GATE: Mutex<()> = Mutex::new(());
pub(crate) fn pending(path: &std::path::Path) -> bool {
    path.parent()
        .is_some_and(|parent| parent.join(".merge-pending.json").exists())
}
thread_local! { static DEPTH: Cell<usize> = const { Cell::new(0) }; }

pub(crate) struct Guard {
    _lock: Option<MutexGuard<'static, ()>>,
    _thread: PhantomData<Rc<()>>,
}

pub(crate) fn lock() -> Guard {
    let nested = DEPTH.with(|d| d.get() > 0);
    let guard = if nested {
        None
    } else {
        Some(GATE.lock().unwrap_or_else(|e| e.into_inner()))
    };
    DEPTH.with(|d| d.set(d.get() + 1));
    Guard {
        _lock: guard,
        _thread: PhantomData,
    }
}

impl Drop for Guard {
    fn drop(&mut self) {
        DEPTH.with(|d| d.set(d.get() - 1));
    }
}
