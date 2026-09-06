use std::sync::{Arc, Mutex};

use tokio::sync::{mpsc, oneshot};

use super::{SessionControl, SessionEntry, SessionPurpose};
use crate::domain::session::{
    HostEndpoint, RouteNodeMetadata, RouteNodeRole, RouteStage, SessionEvent, SessionFailure,
    SessionState,
};

fn route_metadata() -> RouteNodeMetadata {
    RouteNodeMetadata {
        profile_id: "profile-1".into(),
        name: "Test profile".into(),
        endpoint: HostEndpoint::new("example.test", 22).expect("endpoint"),
        index: 0,
        total: 1,
        role: RouteNodeRole::Target,
    }
}

fn connected_entry() -> (
    Arc<SessionEntry>,
    oneshot::Receiver<()>,
    Arc<Mutex<Vec<SessionEvent>>>,
) {
    let (cancel_sender, cancel_receiver) = oneshot::channel();
    let (control_sender, _control_receiver) = mpsc::channel::<SessionControl>(1);
    let events = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&events);
    let entry = Arc::new(SessionEntry::new(
        route_metadata(),
        SessionPurpose::Files,
        Some("profile-1".into()),
        Arc::new(move |event| captured.lock().expect("events").push(event)),
        cancel_sender,
        control_sender,
    ));
    assert!(entry.transition(SessionState::Authenticating));
    assert!(entry.transition(SessionState::Connected));
    (entry, cancel_receiver, events)
}

#[test]
fn transport_loss_fails_a_connected_session_once_and_wakes_its_runner() {
    let (entry, mut cancel_receiver, events) = connected_entry();

    assert!(entry.fail_connected(
        SessionFailure::TransportLost,
        route_metadata(),
        RouteStage::StartSession,
    ));
    assert!(!entry.fail_connected(
        SessionFailure::RemoteDisconnected,
        route_metadata(),
        RouteStage::StartSession,
    ));

    assert_eq!(entry.state(), SessionState::Failed);
    assert_eq!(cancel_receiver.try_recv(), Ok(()));
    let events = events.lock().expect("events");
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event, SessionEvent::StateChanged(SessionState::Failed)))
            .count(),
        1
    );
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event, SessionEvent::Failed { .. }))
            .count(),
        1
    );
    assert!(matches!(
        events.last(),
        Some(SessionEvent::Failed {
            failure: SessionFailure::TransportLost,
            stage: Some(RouteStage::StartSession),
            ..
        })
    ));
}

#[test]
fn user_close_wins_over_a_late_transport_callback() {
    let (entry, mut cancel_receiver, events) = connected_entry();

    entry.begin_close();
    assert!(!entry.fail_connected(
        SessionFailure::TransportLost,
        route_metadata(),
        RouteStage::StartSession,
    ));

    assert_eq!(entry.state(), SessionState::Closing);
    assert_eq!(cancel_receiver.try_recv(), Ok(()));
    assert!(
        events
            .lock()
            .expect("events")
            .iter()
            .all(|event| !matches!(event, SessionEvent::Failed { .. }))
    );
}
