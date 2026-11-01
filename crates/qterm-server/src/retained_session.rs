use crate::{
    error::{ApiError, Result},
    screen_worker::ScreenWorker,
    socket_io::SessionControl,
};
use axum::extract::ws::Message;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
};
use tokio::sync::broadcast;

pub struct RetainedSession {
    pub runtime_key: Option<String>,
    pub kind: String,
    pub profile_id: Option<String>,
    pub screen_id: String,
    worker: Arc<ScreenWorker>,
    pub control: SessionControl,
    inner: Mutex<Inner>,
    pub output: broadcast::Sender<Message>,
}
struct Inner {
    id: String,
    cwd: Option<String>,
    columns: u32,
    rows: u32,
    status: String,
    event: Option<Value>,
    failure: Option<Value>,
    clients: BTreeSet<u64>,
    next_client: u64,
    replies: Vec<Vec<u8>>,
}
impl RetainedSession {
    pub fn new(
        worker: Arc<ScreenWorker>,
        control: SessionControl,
        runtime_key: Option<String>,
        kind: &str,
        profile_id: Option<String>,
        columns: u32,
        rows: u32,
    ) -> Result<Arc<Self>> {
        if runtime_key.as_ref().is_some_and(|s| {
            s.is_empty() || s.len() > 128 || s.chars().any(|c| c.is_control() || c.is_whitespace())
        }) || columns == 0
            || rows == 0
            || columns > 500
            || rows > 300
        {
            return Err(ApiError::invalid());
        }
        let screen_id = uuid::Uuid::new_v4().to_string();
        if kind != "files" {
            let windows_pty = (kind == "local")
                .then(|| {
                    qterm_core::infrastructure::local::pty::terminal_capabilities().windows_pty
                })
                .flatten()
                .map(|pty| json!({"backend":pty.backend,"buildNumber":pty.build_number}));
            crate::screen_worker::create(&worker, &screen_id, columns, rows, windows_pty)?;
        }
        let (output, _) = broadcast::channel(128);
        Ok(Arc::new(Self {
            runtime_key,
            kind: kind.into(),
            profile_id,
            screen_id,
            worker,
            control,
            output,
            inner: Mutex::new(Inner {
                id: String::new(),
                cwd: None,
                columns,
                rows,
                status: "connecting".into(),
                event: None,
                failure: None,
                clients: BTreeSet::new(),
                next_client: 0,
                replies: Vec::new(),
            }),
        }))
    }
    pub fn ready(&self, id: String, cwd: Option<String>) {
        let mut inner = self.inner.lock().unwrap();
        inner.id = id;
        if inner.cwd.is_none() {
            inner.cwd = cwd;
        }
        for reply in std::mem::take(&mut inner.replies) {
            let _ = self.control.write_now(&inner.id, reply);
        }
    }
    pub fn id(&self) -> String {
        self.inner.lock().unwrap().id.clone()
    }
    pub fn metadata(&self) -> Value {
        let s = self.inner.lock().unwrap();
        json!({"sessionId":s.id,"runtimeKey":self.runtime_key,"kind":self.kind,"profileId":self.profile_id,"cwd":s.cwd,"status":s.status,"columns":s.columns,"rows":s.rows})
    }
    pub fn bytes(self: &Arc<Self>) -> Arc<dyn Fn(Vec<u8>) + Send + Sync> {
        let session = Arc::downgrade(self);
        Arc::new(move |data| {
            if let Some(session) = session.upgrade() {
                session.process(data);
            }
        })
    }
    fn process(&self, data: Vec<u8>) {
        let mut state = self.inner.lock().unwrap();
        if self.kind != "files" {
            match self
                .worker
                .call(json!({"op":"write","id":self.screen_id,"data":STANDARD.encode(&data)}))
            {
                Ok(result) => {
                    if let Some(cwd) = result["cwd"].as_str() {
                        state.cwd = Some(cwd.into());
                    }
                    // Only the server answers terminal queries. Browser-generated responses
                    // are filtered by the transport; user keystrokes remain unchanged.
                    if let Some(replies) = result["responses"].as_array() {
                        for reply in replies.iter().filter_map(Value::as_str) {
                            if state.id.is_empty() {
                                state.replies.push(reply.as_bytes().to_vec());
                            } else {
                                let _ =
                                    self.control.write_now(&state.id, reply.as_bytes().to_vec());
                            }
                        }
                    }
                }
                Err(_) => {
                    state.failure = Some(
                        json!({"type":"failed","code":"screenUnavailable","message":"终端画面服务不可用，后台进程仍保留","node":null,"stage":null}),
                    );
                }
            }
        }
        for chunk in data.chunks(16384) {
            let _ = self.output.send(Message::Binary(chunk.to_vec().into()));
        }
    }
    pub fn events(self: &Arc<Self>) -> Arc<dyn Fn(Value) + Send + Sync> {
        let session = Arc::downgrade(self);
        Arc::new(move |event| {
            if let Some(session) = session.upgrade() {
                let mut inner = session.inner.lock().unwrap();
                if let Some(status) = event["state"].as_str() {
                    inner.status = status.into();
                    if status == "connected" {
                        inner.event = None;
                        inner.failure = None;
                    }
                }
                match event["type"].as_str() {
                    Some("hostKeyConfirmationRequired" | "routeProgress") => {
                        inner.event = Some(event.clone())
                    }
                    Some("failed" | "hostKeyChanged") => inner.failure = Some(event.clone()),
                    _ => {}
                }
                let _ = session.output.send(Message::Text(
                    json!({"type":"event","event":event}).to_string().into(),
                ));
            }
        })
    }
    pub fn attach(&self) -> Result<(u64, Value, Vec<u8>, broadcast::Receiver<Message>)> {
        let mut s = self.inner.lock().unwrap();
        let receiver = self.output.subscribe(); // Same lock as output parsing: snapshot and tail cannot overlap.
        let data = if self.kind == "files" {
            Vec::new()
        } else {
            let snapshot = self
                .worker
                .call(json!({"op":"snapshot","id":self.screen_id}))?;
            let mut bytes = snapshot["data"]
                .as_str()
                .ok_or_else(ApiError::invalid)?
                .as_bytes()
                .to_vec();
            if let Some(pending) = snapshot["pending"].as_str() {
                bytes.extend(STANDARD.decode(pending).map_err(|_| ApiError::invalid())?);
            }
            bytes
        };
        s.next_client += 1;
        let client = s.next_client;
        s.clients.insert(client);
        let ready = json!({"type":"ready","sessionId":s.id,"cwd":s.cwd,"columns":s.columns,"rows":s.rows,"readOnly":s.clients.first()!=Some(&client),"status":s.status,"event":s.event,"failure":s.failure});
        Ok((client, ready, data, receiver))
    }
    pub fn writable(&self, client: u64) -> bool {
        self.inner.lock().unwrap().clients.first() == Some(&client)
    }
    pub fn detach(&self, client: u64) {
        self.inner.lock().unwrap().clients.remove(&client);
    }
    pub fn resize(&self, columns: u32, rows: u32) -> Result<()> {
        if columns == 0 || rows == 0 || columns > 500 || rows > 300 {
            return Err(ApiError::invalid());
        }
        let mut s = self.inner.lock().unwrap();
        if self.kind != "files" {
            self.worker
                .call(json!({"op":"resize","id":self.screen_id,"columns":columns,"rows":rows}))?;
        }
        self.control.resize(
            &s.id,
            qterm_core::domain::session::TerminalSize::new(columns, rows)
                .map_err(|_| ApiError::invalid())?,
        )?;
        s.columns = columns;
        s.rows = rows;
        let _ = self.output.send(Message::Text(
            json!({"type":"geometry","columns":columns,"rows":rows})
                .to_string()
                .into(),
        ));
        Ok(())
    }
    pub fn stop(&self) {
        self.control.close(&self.id());
    }
}
impl Drop for RetainedSession {
    fn drop(&mut self) {
        if self.kind != "files" {
            let _ = self
                .worker
                .call(json!({"op":"destroy","id":self.screen_id}));
        }
    }
}
