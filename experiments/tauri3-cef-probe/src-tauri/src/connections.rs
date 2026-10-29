use std::{collections::HashMap, sync::Mutex};
use tauri_runtime_cef::cef::RequestContext;

#[derive(Default)]
pub struct Connections(Mutex<State>);

#[derive(Default)]
struct State {
    closed: bool,
    bindings: HashMap<String, (u16, RequestContext)>,
}

impl Connections {
    pub fn validate(&self, profile: &str, port: u16) -> Result<(), String> {
        let state = self.0.lock().map_err(|e| e.to_string())?;
        if state.closed {
            return Err("connection owner is shut down".into());
        }
        if state
            .bindings
            .get(profile)
            .is_some_and(|(bound, _)| *bound != port)
        {
            return Err("connection proxy binding cannot change when opening a window".into());
        }
        Ok(())
    }

    pub fn configure(
        &self,
        window: &tauri::WebviewWindow,
        profile: &str,
        port: u16,
    ) -> Result<bool, String> {
        self.validate(profile, port)?;
        let (expected, others) = {
            let state = self.0.lock().map_err(|e| e.to_string())?;
            (
                state
                    .bindings
                    .get(profile)
                    .map(|(_, context)| context.clone()),
                state
                    .bindings
                    .iter()
                    .filter(|(key, _)| *key != profile)
                    .map(|(_, (_, context))| context.clone())
                    .collect(),
            )
        };
        let reused = expected.is_some();
        // The stdin controller serializes opens. Never hold this lock across CEF dispatch.
        let context = crate::proxy::configure(window, port, expected, others)?;
        let mut state = self.0.lock().map_err(|e| e.to_string())?;
        if state.closed {
            return Err("connection owner shut down during configuration".into());
        }
        state.bindings.insert(profile.to_string(), (port, context));
        Ok(reused)
    }

    pub fn shutdown(&self) {
        let mut state = self.0.lock().expect("connection owner lock");
        state.closed = true;
        let count = state.bindings.len();
        state.bindings.clear();
        crate::report::emit(
            serde_json::json!({"event":"connection_handles_released","count":count}),
        );
    }
}
