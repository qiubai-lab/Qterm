//! Single-workbench admission. Runtime processes are deliberately outside this owner.
use crate::{
    auth::random_token,
    error::{ApiError, Result},
};
use axum::http::StatusCode;
use serde::Deserialize;
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::watch;

const LOGIN_TTL: Duration = Duration::from_secs(8 * 3600);
const CLAIM_TTL: Duration = Duration::from_secs(120);
const PRESENCE_TTL: Duration = Duration::from_secs(30);
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proof {
    pub access_key: String,
    pub client_id: String,
}
struct Login {
    audit_id: String,
    terminal_locked: bool,
    cookie: String,
    key: String,
    client: String,
    owner: String,
    expires: Instant,
    seen: Instant,
    claimed: bool,
    transport: Option<String>,
}
struct Pending {
    client: String,
    revision: u64,
    expires: Instant,
}
#[derive(Default)]
struct Inner {
    login: Option<Login>,
    pending: HashMap<String, Pending>,
    revision: u64,
}
pub enum Admission {
    Granted { cookie: String, key: String },
    Occupied { ticket: String },
}
pub struct Access {
    inner: Mutex<Inner>,
    changes: watch::Sender<u64>,
}
impl Default for Access {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            changes: watch::channel(0).0,
        }
    }
}
fn valid_client(client: &str) -> Result<()> {
    if client.is_empty()
        || client.len() > 128
        || !client
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(ApiError::invalid());
    }
    Ok(())
}
fn occupied(login: &Login) -> bool {
    login.expires > Instant::now() && login.seen.elapsed() < PRESENCE_TTL
}
pub fn replaced() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "sessionReplaced",
        "连接已被其他会话接管，请重新登录",
    )
}
fn require_active_login(inner: &Inner) -> Result<()> {
    if inner
        .login
        .as_ref()
        .is_some_and(|login| login.expires > Instant::now())
    {
        Ok(())
    } else {
        Err(ApiError::unauthorized())
    }
}
impl Access {
    pub fn audit_session(&self, cookie: &str, key: &str, client: &str) -> Option<String> {
        self.inner
            .lock()
            .unwrap()
            .login
            .as_ref()
            .filter(|s| {
                s.cookie == cookie
                    && s.key == key
                    && s.client == client
                    && s.expires > Instant::now()
            })
            .map(|s| s.audit_id.clone())
    }
    pub fn audit_session_for_cookie(&self, cookie: &str) -> Option<String> {
        self.inner
            .lock()
            .unwrap()
            .login
            .as_ref()
            .filter(|s| s.cookie == cookie)
            .map(|s| s.audit_id.clone())
    }
    pub fn subscribe(&self) -> watch::Receiver<u64> {
        self.changes.subscribe()
    }
    fn changed(&self, inner: &mut Inner) {
        inner.revision += 1;
        self.changes.send_replace(inner.revision);
    }
    pub fn valid(&self, owner: &str) -> bool {
        self.inner
            .lock()
            .unwrap()
            .login
            .as_ref()
            .is_some_and(|s| s.owner == owner && s.expires > Instant::now())
    }
    pub fn cookie_owner(&self, cookie: &str) -> Result<String> {
        let inner = self.inner.lock().unwrap();
        require_active_login(&inner)?;
        inner
            .login
            .as_ref()
            .filter(|s| s.cookie == cookie && s.expires > Instant::now())
            .map(|s| s.owner.clone())
            .ok_or_else(replaced)
    }
    pub fn authorize(&self, cookie: &str, proof: &Proof) -> Result<String> {
        let inner = self.inner.lock().unwrap();
        require_active_login(&inner)?;
        inner
            .login
            .as_ref()
            .filter(|s| {
                s.cookie == cookie
                    && s.key == proof.access_key
                    && s.client == proof.client_id
                    && s.expires > Instant::now()
            })
            .map(|s| s.owner.clone())
            .ok_or_else(replaced)
    }
    pub fn prove_owner(&self, owner: &str, proof: &Proof) -> Result<()> {
        let inner = self.inner.lock().unwrap();
        require_active_login(&inner)?;
        if inner.login.as_ref().is_some_and(|s| {
            s.owner == owner
                && s.key == proof.access_key
                && s.client == proof.client_id
                && s.expires > Instant::now()
        }) {
            Ok(())
        } else {
            Err(replaced())
        }
    }
    fn pending(inner: &mut Inner, client: &str) -> Result<Admission> {
        inner
            .pending
            .retain(|_, p| p.expires > Instant::now() && p.client != client);
        if inner.pending.len() >= 32 {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "busy",
                "等待接管的请求过多，请稍后重试",
            ));
        }
        let ticket = random_token()?;
        inner.pending.insert(
            ticket.clone(),
            Pending {
                client: client.into(),
                revision: inner.revision,
                expires: Instant::now() + CLAIM_TTL,
            },
        );
        Ok(Admission::Occupied { ticket })
    }
    fn grant(&self, inner: &mut Inner, client: &str, terminal_locked: bool) -> Result<Admission> {
        let cookie = random_token()?;
        let key = random_token()?;
        let owner = random_token()?;
        inner.login = Some(Login {
            audit_id: uuid::Uuid::new_v4().to_string(),
            terminal_locked,
            cookie: cookie.clone(),
            key: key.clone(),
            client: client.into(),
            owner,
            expires: Instant::now() + LOGIN_TTL,
            seen: Instant::now(),
            claimed: true,
            transport: None,
        });
        self.changed(inner);
        Ok(Admission::Granted { cookie, key })
    }
    pub fn login(&self, client: &str, terminal_locked: bool) -> Result<Admission> {
        valid_client(client)?;
        let mut inner = self.inner.lock().unwrap();
        if inner.login.as_ref().is_some_and(occupied) {
            Self::pending(&mut inner, client)
        } else {
            self.grant(&mut inner, client, terminal_locked)
        }
    }
    pub fn resume(&self, cookie: &str, proof: &Proof, terminal_locked: bool) -> Result<Admission> {
        valid_client(&proof.client_id)?;
        let mut inner = self.inner.lock().unwrap();
        require_active_login(&inner)?;
        let login = inner
            .login
            .as_ref()
            .filter(|s| {
                s.cookie == cookie && s.key == proof.access_key && s.expires > Instant::now()
            })
            .ok_or_else(replaced)?;
        if login.client != proof.client_id && login.claimed && occupied(login) {
            return Self::pending(&mut inner, &proof.client_id);
        }
        let changed = login.client != proof.client_id;
        let lock_changed = terminal_locked && !login.terminal_locked;
        let login = inner.login.as_mut().unwrap();
        if changed {
            login.client = proof.client_id.clone();
            login.owner = random_token()?;
            login.transport = None;
        }
        login.claimed = true;
        login.terminal_locked |= terminal_locked;
        login.seen = Instant::now();
        let result = Admission::Granted {
            cookie: login.cookie.clone(),
            key: login.key.clone(),
        };
        if changed || lock_changed {
            self.changed(&mut inner);
        }
        Ok(result)
    }
    pub fn takeover(&self, ticket: &str, client: &str, terminal_locked: bool) -> Result<Admission> {
        valid_client(client)?;
        let mut inner = self.inner.lock().unwrap();
        let pending = inner.pending.remove(ticket).ok_or_else(|| {
            ApiError::new(
                StatusCode::CONFLICT,
                "claimExpired",
                "接管请求已失效，请重新登录",
            )
        })?;
        if pending.client != client
            || pending.expires <= Instant::now()
            || pending.revision != inner.revision
        {
            return Err(ApiError::new(
                StatusCode::CONFLICT,
                "claimExpired",
                "连接状态已变化，请重新登录后再确认接管",
            ));
        }
        self.grant(&mut inner, client, terminal_locked)
    }
    pub fn revoke(&self) {
        let mut inner = self.inner.lock().unwrap();
        inner.login = None;
        self.changed(&mut inner);
    }
    pub fn terminal_locked(&self, owner: &str) -> Result<bool> {
        let inner = self.inner.lock().unwrap();
        require_active_login(&inner)?;
        let login = inner
            .login
            .as_ref()
            .filter(|s| s.owner == owner && s.expires > Instant::now())
            .ok_or_else(replaced)?;
        Ok(login.terminal_locked)
    }
    pub fn set_terminal_locked(&self, owner: &str, locked: bool) -> Result<bool> {
        let mut inner = self.inner.lock().unwrap();
        require_active_login(&inner)?;
        let login = inner
            .login
            .as_mut()
            .filter(|s| s.owner == owner && s.expires > Instant::now())
            .ok_or_else(replaced)?;
        if login.terminal_locked == locked {
            return Ok(false);
        }
        login.terminal_locked = locked;
        self.changed(&mut inner);
        Ok(true)
    }
    pub fn attach(&self, owner: &str, terminal_locked: bool) -> Result<String> {
        let mut inner = self.inner.lock().unwrap();
        require_active_login(&inner)?;
        let login = inner
            .login
            .as_mut()
            .filter(|s| s.owner == owner && s.expires > Instant::now())
            .ok_or_else(replaced)?;
        let transport = random_token()?;
        login.transport = Some(transport.clone());
        login.claimed = true;
        login.seen = Instant::now();
        login.terminal_locked |= terminal_locked;
        // Replacing a transport also invalidates outstanding readers and wakes the old socket.
        self.changed(&mut inner);
        Ok(transport)
    }
    pub fn owns_transport(&self, owner: &str, transport: &str) -> bool {
        self.inner
            .lock()
            .unwrap()
            .login
            .as_ref()
            .is_some_and(|s| s.owner == owner && s.transport.as_deref() == Some(transport))
    }
    pub fn touch(&self, owner: &str, transport: &str) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let Some(login) = inner.login.as_mut().filter(|s| {
            s.owner == owner
                && s.transport.as_deref() == Some(transport)
                && s.expires > Instant::now()
        }) else {
            return false;
        };
        login.seen = Instant::now();
        true
    }
    pub fn detach(&self, owner: &str, transport: &str, terminal_locked: bool) -> bool {
        let mut inner = self.inner.lock().unwrap();
        if let Some(login) = inner
            .login
            .as_mut()
            .filter(|s| s.owner == owner && s.transport.as_deref() == Some(transport))
        {
            let lock_changed = terminal_locked && !login.terminal_locked;
            login.terminal_locked |= terminal_locked;
            login.claimed = false;
            login.seen = Instant::now();
            login.transport = None;
            if lock_changed {
                self.changed(&mut inner);
            }
            return true;
        }
        false
    }
    #[cfg(test)]
    pub fn fixture(&self) -> Result<String> {
        let token = random_token()?;
        let mut inner = self.inner.lock().unwrap();
        inner.login = Some(Login {
            audit_id: uuid::Uuid::new_v4().to_string(),
            terminal_locked: false,
            cookie: token.clone(),
            key: token.clone(),
            client: "test-client".into(),
            owner: token.clone(),
            expires: Instant::now() + LOGIN_TTL,
            seen: Instant::now(),
            claimed: true,
            transport: None,
        });
        self.changed(&mut inner);
        Ok(token)
    }
}

#[cfg(test)]
#[path = "access_tests.rs"]
mod tests;
