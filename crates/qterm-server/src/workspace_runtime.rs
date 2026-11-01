//! Authoritative workspace snapshot and bounded browser drafts; process state never goes to disk.
use crate::{
    auth::Identity,
    error::{ApiError, Result},
    state::ServerState,
};
use axum::{
    Extension, Json,
    extract::{Path, State},
};
use qterm_protocol::workspaces::WorkspaceDocumentDto;
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc};
#[derive(Default)]
pub struct Runtime {
    pub document: Option<WorkspaceDocumentDto>,
    pub panes: HashMap<String, Value>,
}

pub fn default_document() -> WorkspaceDocumentDto {
    let id = uuid::Uuid::new_v4().to_string();
    let block = uuid::Uuid::new_v4().to_string();
    serde_json::from_value(json!({"schemaVersion":10,"activeWorkspaceId":id,"recentProfileIds":[],"recentGitRepositories":[],"workspaces":[{"id":id,"name":"工作区-1","activeBlockId":block,"layout":{"type":"terminal","blockId":block,"profileId":null,"restoreDirectory":null}}]})).unwrap()
}
pub async fn pane(State(state): State<Arc<ServerState>>, Path(key): Path<String>) -> Json<Value> {
    Json(
        state
            .workspace_runtime
            .lock()
            .unwrap()
            .panes
            .get(&key)
            .cloned()
            .unwrap_or(json!({"revision":0,"value":null})),
    )
}
pub async fn save_pane(
    State(state): State<Arc<ServerState>>,
    Extension(owner): Extension<Identity>,
    Path(key): Path<String>,
    Json(value): Json<Value>,
) -> Result<Json<Value>> {
    let _gate = state.vault_gate.lock().await;
    if !state.auth.valid(&owner.0) {
        return Err(ApiError::unauthorized());
    }
    if key.len() > 200 || value.to_string().len() > 4 * 1024 * 1024 {
        return Err(ApiError::invalid());
    }
    let mut runtime = state.workspace_runtime.lock().unwrap();
    let expected = value
        .get("revision")
        .and_then(Value::as_u64)
        .ok_or_else(ApiError::invalid)?;
    let current = runtime
        .panes
        .get(&key)
        .and_then(|v| v["revision"].as_u64())
        .unwrap_or(0);
    if expected != current {
        return Err(ApiError::new(
            axum::http::StatusCode::CONFLICT,
            "draftConflict",
            "文件草稿已在另一页面更新，请刷新后重试",
        ));
    }
    if value.get("value").is_none() {
        return Err(ApiError::invalid());
    }
    let value = json!({"revision":current+1,"value":value["value"]});
    let size: usize = runtime
        .panes
        .iter()
        .filter(|(k, _)| *k != &key)
        .map(|(_, v)| v.to_string().len())
        .sum();
    if size + value.to_string().len() > 16 * 1024 * 1024
        || (!runtime.panes.contains_key(&key) && runtime.panes.len() >= 64)
    {
        return Err(ApiError::new(
            axum::http::StatusCode::PAYLOAD_TOO_LARGE,
            "draftLimit",
            "服务端草稿内存已达上限，请保存或关闭文件",
        ));
    }
    runtime.panes.insert(key, value);
    Ok(Json(json!({"revision":current+1})))
}

#[cfg(test)]
mod tests {
    use crate::tests::{call, fixture};
    use axum::http::StatusCode;
    use serde_json::{Value, json};

    #[tokio::test]
    async fn workspace_identity_survives_reload_and_rejects_stale_layouts() {
        let (_dir, state, token) = fixture();
        let path = "/api/v1/workspace";
        let (status, first) = call(state.clone(), &token, "GET", path, Value::Null).await;
        assert_eq!(status, StatusCode::OK);
        assert!(first["document"]["activeWorkspaceId"].is_string());
        let (_, second) = call(state.clone(), &token, "GET", path, Value::Null).await;
        assert_eq!(first, second);
        let (_, unchanged) = call(state.clone(), &token, "PUT", path, first.clone()).await;
        assert_eq!(unchanged["revision"], first["revision"]);
        let mut first = first;
        first["document"]["workspaces"][0]["name"] = json!("renamed workspace");
        assert_eq!(
            call(state.clone(), &token, "PUT", path, first.clone())
                .await
                .0,
            StatusCode::OK
        );
        assert_eq!(
            call(state.clone(), &token, "PUT", path, first).await.0,
            StatusCode::CONFLICT
        );
    }

    #[tokio::test]
    async fn drafts_survive_relogin_are_private_and_cannot_overwrite_newer_edits() {
        let (_dir, state, token) = fixture();
        let path = "/api/v1/runtime/panes/block:local";
        let draft =
            json!({"revision":0,"value":{"content":"unsaved text","entry":{"path":"/notes"}}});
        assert_eq!(
            call(state.clone(), "wrong", "GET", path, Value::Null)
                .await
                .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(state.clone(), &token, "PUT", path, draft.clone())
                .await
                .0,
            StatusCode::OK
        );
        assert_eq!(
            call(state.clone(), &token, "PUT", path, draft).await.0,
            StatusCode::CONFLICT
        );
        assert_eq!(
            call(state.clone(), &token, "POST", "/api/v1/logout", Value::Null)
                .await
                .0,
            StatusCode::NO_CONTENT
        );
        let token = state.auth.issue().unwrap();
        let (_, saved) = call(state.clone(), &token, "GET", path, Value::Null).await;
        assert_eq!(saved["value"]["content"], "unsaved text");
        assert_eq!(saved["revision"], 1);
        assert_eq!(
            call(
                state.clone(),
                &token,
                "PUT",
                path,
                json!({"revision":1,"value":null})
            )
            .await
            .0,
            StatusCode::OK
        );
        let (_, cleared) = call(state.clone(), &token, "GET", path, Value::Null).await;
        assert_eq!(cleared, json!({"revision":2,"value":null}));
    }
}
