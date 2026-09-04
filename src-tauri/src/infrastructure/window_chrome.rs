//! Native macOS window-chrome geometry that is not stable across AppKit versions.

use block2::RcBlock;
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_app_kit::{NSWindow, NSWindowButton, NSWindowDidUpdateNotification};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol, NSPoint};
use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{Window, WindowEvent};

const APP_CHROME_HEIGHT: f64 = 40.0;
const TRAFFIC_LIGHT_LEADING_INSET: f64 = 14.0;
const POST_LAYOUT_PASSES: u8 = 2;
const ALIGNMENT_IDLE: u8 = 0;
const ALIGNMENT_QUEUED: u8 = 1;
const ALIGNMENT_DIRTY: u8 = 2;
const GEOMETRY_EPSILON: f64 = 0.25;

type WindowUpdateObserver = Retained<ProtocolObject<dyn NSObjectProtocol>>;

thread_local! {
    static WINDOW_UPDATE_OBSERVER: RefCell<Option<WindowUpdateObserver>> = const {
        RefCell::new(None)
    };
}

// Qterm currently owns one decorated main window. A process-wide state keeps resize bursts from
// creating an unbounded main-thread task queue while remembering the newest relayout request.
static ALIGNMENT_STATE: AtomicU8 = AtomicU8::new(ALIGNMENT_IDLE);

#[derive(Debug, PartialEq, Eq)]
enum WindowChromeAction {
    Schedule,
    Uninstall,
    Ignore,
}

fn centered_origin(center: f64, item_height: f64) -> f64 {
    center - item_height / 2.0
}

fn coordinate_needs_update(actual: f64, target: f64) -> bool {
    (actual - target).abs() > GEOMETRY_EPSILON
}

/// Installs the native post-update reconciliation for Qterm's main window.
pub fn install_traffic_light_alignment(window: &Window) -> tauri::Result<()> {
    if window.label() != "main" {
        return Ok(());
    }

    let ns_window = window.ns_window()?;
    // SAFETY: Tauri supplies its live NSWindow and setup runs on the application main thread.
    let ns_window = unsafe { &*ns_window.cast::<NSWindow>() };
    let callback_window = window.clone();
    let callback = RcBlock::new(move |_notification: NonNull<NSNotification>| {
        align_traffic_lights(&callback_window);
    });
    let center = NSNotificationCenter::defaultCenter();
    // SAFETY: The observer is scoped to the live main NSWindow, the block signature matches the
    // notification API, and AppKit posts window-update notifications on the main thread.
    let observer = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(NSWindowDidUpdateNotification),
            Some(ns_window),
            None,
            &callback,
        )
    };
    replace_window_update_observer(observer);
    schedule_traffic_light_alignment(window)
}

fn replace_window_update_observer(observer: WindowUpdateObserver) {
    let previous = WINDOW_UPDATE_OBSERVER.with(|slot| slot.borrow_mut().replace(observer));
    if let Some(previous) = previous {
        remove_window_update_observer(previous);
    }
}

fn uninstall_window_update_observer() {
    let observer = WINDOW_UPDATE_OBSERVER.with(|slot| slot.borrow_mut().take());
    if let Some(observer) = observer {
        remove_window_update_observer(observer);
    }
    ALIGNMENT_STATE.store(ALIGNMENT_IDLE, Ordering::Release);
}

fn remove_window_update_observer(observer: WindowUpdateObserver) {
    let center = NSNotificationCenter::defaultCenter();
    let observer: &ProtocolObject<dyn NSObjectProtocol> = observer.as_ref();
    // SAFETY: This is the opaque token returned by this same notification center.
    unsafe { center.removeObserver(observer.as_ref()) };
}

/// Requests alignment after AppKit has had an opportunity to lay out its title-bar hierarchy.
pub fn schedule_traffic_light_alignment(window: &Window) -> tauri::Result<()> {
    if window.label() != "main" || !mark_alignment_requested() {
        return Ok(());
    }

    if let Err(error) = queue_alignment_pass(window.clone(), POST_LAYOUT_PASSES) {
        ALIGNMENT_STATE.store(ALIGNMENT_IDLE, Ordering::Release);
        return Err(error);
    }

    Ok(())
}

/// Reasserts the native geometry after window events that can make AppKit rebuild its title bar.
pub fn schedule_after_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    match action_for_window_event(event) {
        WindowChromeAction::Schedule => {
            let _ = schedule_traffic_light_alignment(window);
        }
        WindowChromeAction::Uninstall => uninstall_window_update_observer(),
        WindowChromeAction::Ignore => {}
    }
}

fn mark_alignment_requested() -> bool {
    loop {
        let current = ALIGNMENT_STATE.load(Ordering::Acquire);
        let (next, starts_cycle) = request_transition(current);
        if current == next {
            return starts_cycle;
        }
        if ALIGNMENT_STATE
            .compare_exchange(current, next, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            return starts_cycle;
        }
    }
}

fn request_transition(current: u8) -> (u8, bool) {
    match current {
        ALIGNMENT_IDLE => (ALIGNMENT_QUEUED, true),
        ALIGNMENT_QUEUED => (ALIGNMENT_DIRTY, false),
        ALIGNMENT_DIRTY => (ALIGNMENT_DIRTY, false),
        unexpected => {
            debug_assert!(
                false,
                "unexpected traffic-light alignment state: {unexpected}"
            );
            (ALIGNMENT_DIRTY, false)
        }
    }
}

fn queue_alignment_pass(window: Window, remaining_passes: u8) -> tauri::Result<()> {
    let task_window = window.clone();
    window.run_on_main_thread(move || {
        align_traffic_lights(&task_window);

        if remaining_passes > 1 {
            let recovery_window = task_window.clone();
            if queue_alignment_pass(task_window, remaining_passes - 1).is_err() {
                finish_alignment_cycle(&recovery_window);
            }
        } else {
            finish_alignment_cycle(&task_window);
        }
    })
}

fn finish_alignment_cycle(window: &Window) {
    let completed_state = ALIGNMENT_STATE.swap(ALIGNMENT_IDLE, Ordering::AcqRel);
    if completed_state == ALIGNMENT_DIRTY {
        let _ = schedule_traffic_light_alignment(window);
    }
}

fn action_for_window_event(event: &WindowEvent) -> WindowChromeAction {
    match event {
        WindowEvent::Resized(_)
        | WindowEvent::Moved(_)
        | WindowEvent::Focused(true)
        | WindowEvent::ScaleFactorChanged { .. } => WindowChromeAction::Schedule,
        WindowEvent::Destroyed => WindowChromeAction::Uninstall,
        _ => WindowChromeAction::Ignore,
    }
}

fn align_traffic_lights(window: &Window) {
    let Ok(ns_window) = window.ns_window() else {
        return;
    };

    // SAFETY: Tauri returns the live NSWindow for this window. Callers run either from Tauri's
    // main-thread queue or an AppKit main-thread notification; the buttons outlive this call.
    let ns_window = unsafe { &*ns_window.cast::<NSWindow>() };
    align_standard_buttons(ns_window);
}

fn align_standard_buttons(window: &NSWindow) {
    let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(miniaturize) = window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let zoom = window.standardWindowButton(NSWindowButton::ZoomButton);

    // SAFETY: AppKit owns the standard two-level title-bar hierarchy for decorated windows.
    let Some(button_group) = (unsafe { close.superview() }) else {
        return;
    };
    let Some(title_bar_container) = (unsafe { button_group.superview() }) else {
        return;
    };

    let window_height = window.frame().size.height;
    let mut title_bar_frame = title_bar_container.frame();
    let target_title_bar_y = window_height - APP_CHROME_HEIGHT;
    if coordinate_needs_update(title_bar_frame.size.height, APP_CHROME_HEIGHT)
        || coordinate_needs_update(title_bar_frame.origin.y, target_title_bar_y)
    {
        title_bar_frame.size.height = APP_CHROME_HEIGHT;
        title_bar_frame.origin.y = target_title_bar_y;
        title_bar_container.setFrame(title_bar_frame);
        title_bar_container.layoutSubtreeIfNeeded();
    }

    let target_center = button_group
        .convertPoint_fromView(
            NSPoint::new(0.0, APP_CHROME_HEIGHT / 2.0),
            Some(&title_bar_container),
        )
        .y;

    let close_frame = close.frame();
    let spacing = miniaturize.frame().origin.x - close_frame.origin.x;
    let mut buttons = vec![close, miniaturize];
    if let Some(zoom) = zoom {
        buttons.push(zoom);
    }

    for (index, button) in buttons.into_iter().enumerate() {
        let frame = button.frame();
        let target_origin = NSPoint::new(
            TRAFFIC_LIGHT_LEADING_INSET + index as f64 * spacing,
            centered_origin(target_center, frame.size.height),
        );
        if coordinate_needs_update(frame.origin.x, target_origin.x)
            || coordinate_needs_update(frame.origin.y, target_origin.y)
        {
            button.setFrameOrigin(target_origin);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::{PhysicalPosition, PhysicalSize};

    #[test]
    fn centers_different_native_button_sizes_on_the_same_chrome_midline() {
        for button_height in [12.0, 14.0, 16.0] {
            let origin = centered_origin(APP_CHROME_HEIGHT / 2.0, button_height);
            assert_eq!(origin + button_height / 2.0, APP_CHROME_HEIGHT / 2.0);
        }
    }

    #[test]
    fn centering_does_not_depend_on_appkits_initial_button_origin() {
        let expected = centered_origin(APP_CHROME_HEIGHT / 2.0, 14.0);
        for ignored_appkit_origin in [5.0, 9.0] {
            assert_eq!(expected, 13.0);
            assert_ne!(expected, ignored_appkit_origin);
        }
    }

    #[test]
    fn native_relayout_events_request_post_layout_alignment() {
        assert_eq!(
            action_for_window_event(&WindowEvent::Resized(PhysicalSize::new(1200, 800))),
            WindowChromeAction::Schedule
        );
        assert_eq!(
            action_for_window_event(&WindowEvent::Moved(PhysicalPosition::new(100, 100))),
            WindowChromeAction::Schedule
        );
        assert_eq!(
            action_for_window_event(&WindowEvent::Focused(true)),
            WindowChromeAction::Schedule
        );
    }

    #[test]
    fn ignores_focus_loss_and_uninstalls_the_observer_on_destruction() {
        assert_eq!(
            action_for_window_event(&WindowEvent::Focused(false)),
            WindowChromeAction::Ignore
        );
        assert_eq!(
            action_for_window_event(&WindowEvent::Destroyed),
            WindowChromeAction::Uninstall
        );
    }

    #[test]
    fn coalesces_requests_but_remembers_a_request_during_an_active_cycle() {
        assert_eq!(request_transition(ALIGNMENT_IDLE), (ALIGNMENT_QUEUED, true));
        assert_eq!(
            request_transition(ALIGNMENT_QUEUED),
            (ALIGNMENT_DIRTY, false)
        );
        assert_eq!(
            request_transition(ALIGNMENT_DIRTY),
            (ALIGNMENT_DIRTY, false)
        );
    }

    #[test]
    fn geometry_reconciliation_ignores_subpixel_noise_but_repairs_native_resets() {
        assert!(!coordinate_needs_update(20.0, 20.0));
        assert!(!coordinate_needs_update(20.2, 20.0));
        assert!(coordinate_needs_update(19.0, 20.0));
        assert!(coordinate_needs_update(26.0, 20.0));
    }
}
