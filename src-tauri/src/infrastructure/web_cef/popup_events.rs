//! Serialize native popup notifications into pending requests and adopted tab events.
use super::{WebHost, navigation::Navigation};
use std::collections::VecDeque;
use tauri::{Emitter, Manager};
use tauri_runtime_cef::{FrameEvent, FrameEventKind, cef::*, embedded_popups::Event};

pub(super) struct Pending {
    pub browser: Browser,
    pub source: String,
    pub url: String,
    pub events: VecDeque<Event>,
}
pub(super) async fn install(app: &tauri::AppHandle, view: &tauri::Webview) -> Result<(), String> {
    let (send, mut receive) = tokio::sync::mpsc::unbounded_channel();
    super::native::with(view, move |view| {
        tauri_runtime_cef::embedded_popups::register(&view.browser(), move |event| {
            let _ = send.send(event);
        })
    })
    .await?;
    let app = app.clone();
    let root = view.label().to_owned();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receive.recv().await {
            if let Err(error) = process(&app, &root, event).await {
                eprintln!("CEF popup event: {error}");
            }
        }
    });
    Ok(())
}
async fn process(app: &tauri::AppHandle, root: &str, event: Event) -> Result<(), String> {
    let host = app.state::<WebHost>();
    let mut state = host.state.lock().await;
    if let Event::Created {
        browser,
        parent,
        url,
    } = event
    {
        // Runtime assigns the actual native parent even for noopener popups.
        let source = state
            .guests
            .iter()
            .find(|(_, g)| g.popup.as_ref().is_some_and(|p| p.identifier() == parent))
            .map(|(label, _)| label.clone())
            .unwrap_or_else(|| root.to_owned());
        let admitted = state.guests.get(&source).is_some_and(|g| {
            g.closing.is_none()
                && state
                    .environments
                    .get(&g.environment)
                    .is_some_and(|e| !e.retiring)
        });
        if !admitted
            || crate::domain::web::ensure_web_page_capacity(
                state.guests.len() + state.pending_popups.len(),
            )
            .is_err()
        {
            drop(state);
            return close(app, browser).await;
        }
        let request = uuid::Uuid::new_v4().to_string();
        state.pending_popups.insert(
            request.clone(),
            Pending {
                browser,
                source: source.clone(),
                url: url.clone(),
                events: VecDeque::new(),
            },
        );
        let emitted = app.emit_to(
            "main",
            "web-popup",
            serde_json::json!({"label":source,"requestId":request,"url":url,"message":null}),
        );
        #[cfg(feature = "cef-integration-test")]
        super::test_control::emit(
            serde_json::json!({"event":"popup-request","source":source,"request":request,"url":url}),
        );
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if emitted.is_ok() {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            }
            let _ = super::popups::reject_popup(&app, &request).await;
        });
        return Ok(());
    }
    if matches!(&event, Event::Frame(frame) if !frame.is_main) {
        return Ok(());
    }
    let id = match &event {
        Event::Frame(event) => event.browser_id,
        Event::Title { id, .. } | Event::Closed { id } => *id,
        Event::Created { .. } => unreachable!(),
    };
    if matches!(event, Event::Closed { .. }) {
        state
            .pending_popups
            .retain(|_, p| p.browser.identifier() != id);
        let closed = state
            .guests
            .iter()
            .find(|(_, g)| g.popup.as_ref().is_some_and(|b| b.identifier() == id))
            .map(|(label, _)| label.clone());
        if let Some(label) = closed {
            // Native close is authoritative even if the UI listener has gone.
            WebHost::close_page(&mut state, app, &label).await?;
            let _ = app.emit_to("main", "web-window-close", &label);
            #[cfg(feature = "cef-integration-test")]
            super::test_control::emit(serde_json::json!({"event":"popup-closed","id":label}));
        }
        return Ok(());
    }
    if let Some(guest) = state
        .guests
        .values()
        .find(|g| g.popup.as_ref().is_some_and(|b| b.identifier() == id))
    {
        navigation(&guest.navigation, &event);
    } else if let Some(pending) = state
        .pending_popups
        .values_mut()
        .find(|p| p.browser.identifier() == id)
    {
        if pending.events.len() == 32 {
            pending.events.pop_front();
        }
        pending.events.push_back(event);
    }
    Ok(())
}
pub(super) fn navigation(navigation: &Navigation, event: &Event) {
    match event {
        Event::Title { title, .. } => navigation.title(title.clone()),
        Event::Frame(FrameEvent {
            is_main: true,
            kind,
            ..
        }) => match kind {
            FrameEventKind::NavigationStarted { url } => navigation.start(url.to_string()),
            FrameEventKind::DocumentCommitted { url } => navigation.source(url.to_string(), true),
            FrameEventKind::AddressChanged { url } => navigation.source(url.to_string(), false),
            FrameEventKind::NavigationFailed { url } => navigation.failed(url.as_str()),
            FrameEventKind::LoadingStateChanged { is_loading: false } => navigation.finish(),
            _ => {}
        },
        _ => {}
    }
}
pub(super) async fn close(app: &tauri::AppHandle, browser: Browser) -> Result<(), String> {
    let captured = browser.clone();
    super::native::on_ui(app, move || {
        if captured.is_valid() != 0
            && let Some(host) = captured.host()
        {
            host.close_browser(1);
        }
        Ok(())
    })
    .await?;
    super::native::wait_closed(app, &[browser]).await
}
