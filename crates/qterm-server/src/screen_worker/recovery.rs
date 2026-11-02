//! Memory-only checkpoints and a bounded tail of parser operations, never PTY input.
use serde_json::{Value, json};
const CHECKPOINT_BYTES: usize = 256 * 1024;
const MAX_TAIL_BYTES: usize = 8 * 1024 * 1024;
const MAX_TAIL_OPS: usize = 4096;

pub(super) struct Replay {
    pub request: Value,
    pub pending_reply: bool,
}
pub(super) struct Screen {
    create: Value,
    checkpoint: Option<Value>,
    pub tail: Vec<Replay>,
    bytes: usize,
    pub lost: bool,
    pub replies: Vec<Value>,
}
impl Screen {
    pub fn new(create: Value) -> Self {
        Self {
            create,
            checkpoint: None,
            tail: Vec::new(),
            bytes: 0,
            lost: false,
            replies: Vec::new(),
        }
    }
    pub fn restore(&self) -> Value {
        if let Some(checkpoint) = &self.checkpoint {
            let mut request = self.create.clone();
            request["op"] = json!("restore");
            request["snapshot"] = checkpoint.clone();
            request
        } else {
            self.create.clone()
        }
    }
    pub fn record(&mut self, request: Value, delivered: bool) {
        if !matches!(request["op"].as_str(), Some("write" | "resize"))
            || self.lost
            || (!delivered && request["op"] == "resize")
        {
            return;
        }
        self.bytes += request.to_string().len();
        if self.bytes > MAX_TAIL_BYTES || self.tail.len() >= MAX_TAIL_OPS {
            self.invalidate();
            return;
        }
        self.tail.push(Replay {
            request,
            pending_reply: !delivered,
        });
    }
    pub fn invalidate(&mut self) {
        self.lost = true;
        self.checkpoint = None;
        self.tail.clear();
        self.replies.clear();
    }
    pub fn complete(&mut self, response: &mut Value) {
        let mut replies = std::mem::take(&mut self.replies);
        if let Some(current) = response["responses"].as_array() {
            replies.extend(current.iter().cloned());
        }
        response["responses"] = json!(replies);
        for entry in &mut self.tail {
            entry.pending_reply = false;
        }
    }
    pub fn needs_checkpoint(&self) -> bool {
        !self.lost
            && (self.bytes >= CHECKPOINT_BYTES || self.tail.len() >= 128)
            && !self.tail.iter().any(|entry| entry.pending_reply)
    }
    pub fn checkpoint(&mut self, mut snapshot: Value) {
        snapshot.as_object_mut().unwrap().remove("responses");
        self.checkpoint = Some(snapshot);
        self.tail.clear();
        self.bytes = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outage_tail_is_bounded_and_never_silently_drops_history() {
        let mut screen = Screen::new(json!({"op":"create","id":"a"}));
        let chunk = "x".repeat(1024 * 1024);
        for _ in 0..9 {
            screen.record(json!({"op":"write","data":chunk}), false);
        }
        assert!(screen.lost);
        assert!(screen.tail.is_empty());
        assert!(!screen.needs_checkpoint());
    }
}
