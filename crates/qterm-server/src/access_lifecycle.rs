//! Serializes admission, presence, and logout with vault verification and secret cleanup.
use crate::{
    access::{Admission, Proof},
    error::{ApiError, Result},
    state::ServerState,
};
use qterm_core::application::credential_lifecycle::LockReason;

fn requires_lock(state: &ServerState) -> Result<bool> {
    let status = state.vault.status()?;
    Ok(status.initialized && !status.legacy)
}

fn seal(state: &ServerState) {
    state.clear_login_secrets();
    state.vault.lock(LockReason::Manual);
}

fn admitted(state: &ServerState, admission: Admission) -> Admission {
    if matches!(admission, Admission::Granted { .. }) {
        seal(state);
    }
    admission
}

pub async fn login(state: &ServerState, client: &str) -> Result<Admission> {
    let _gate = state.vault_gate.lock().await;
    // Publish identity and protection atomically; pending/failed admissions have no side effects.
    let admission = state.auth.access.login(client, requires_lock(state)?)?;
    Ok(admitted(state, admission))
}

pub async fn resume(state: &ServerState, cookie: &str, proof: &Proof) -> Result<Admission> {
    let _gate = state.vault_gate.lock().await;
    let locked = requires_lock(state)?;
    let admission = state.auth.access.resume(cookie, proof, locked)?;
    Ok(if locked {
        admitted(state, admission)
    } else {
        admission
    })
}

pub async fn takeover(state: &ServerState, ticket: &str, client: &str) -> Result<Admission> {
    let _gate = state.vault_gate.lock().await;
    let admission = state
        .auth
        .access
        .takeover(ticket, client, requires_lock(state)?)?;
    Ok(admitted(state, admission))
}

pub async fn attach(state: &ServerState, owner: &str, proof: &Proof) -> Result<String> {
    let _gate = state.vault_gate.lock().await;
    state.auth.access.prove_owner(owner, proof)?;
    let locked = requires_lock(state)?;
    let transport = state.auth.access.attach(owner, locked)?;
    if locked {
        seal(state);
    }
    Ok(transport)
}

pub async fn detach(state: &ServerState, owner: &str, transport: &str) {
    let _gate = state.vault_gate.lock().await;
    // A broken vault must never leave a disconnected workspace accessible.
    let locked = requires_lock(state).unwrap_or(true);
    if state.auth.access.detach(owner, transport, locked) && locked {
        seal(state);
    }
}

pub async fn logout(state: &ServerState, owner: &str) -> Result<()> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(owner) {
        return Err(ApiError::unauthorized());
    }
    state.auth.revoke();
    seal(state);
    Ok(())
}

#[derive(Clone)]
pub struct LockOutcome {
    pub changed: bool,
}

pub async fn lock(state: &ServerState, owner: &str) -> Result<LockOutcome> {
    let _gate = state.vault_gate.lock().await;
    state.auth.access.terminal_locked(owner)?;
    if !requires_lock(state)? {
        return Err(ApiError::invalid());
    }
    let changed = state.auth.access.set_terminal_locked(owner, true)?;
    seal(state);
    Ok(LockOutcome { changed })
}

#[cfg(test)]
#[path = "access_lifecycle_tests.rs"]
mod tests;
