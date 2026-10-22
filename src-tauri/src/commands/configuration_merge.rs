use super::{error::IpcError, native_dialog, settings::SettingsState};
use crate::{
    application::configuration_merge::ConfigurationMergeService,
    domain::{auth::SecretText, configuration_merge::*},
    infrastructure::persistence::{
        configuration_gate, configuration_merge::FileConfigurationMergeStorage,
        json_credential_vault::JsonCredentialVault,
    },
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

pub struct ConfigurationMergeState(Mutex<ConfigurationMergeService<FileConfigurationMergeStorage>>);
impl ConfigurationMergeState {
    pub fn new(root: std::path::PathBuf, vault: JsonCredentialVault) -> Self {
        Self(Mutex::new(ConfigurationMergeService::new(
            FileConfigurationMergeStorage::new(root, vault),
        )))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MergeInput {
    connections: bool,
    network: bool,
    credentials: bool,
    source_password: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryDto {
    count: usize,
    error: Option<String>,
}
impl From<MergeCategoryStatus> for CategoryDto {
    fn from(v: MergeCategoryStatus) -> Self {
        Self {
            count: v.count,
            error: v.error,
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDto {
    source: String,
    connections: CategoryDto,
    network: CategoryDto,
    credentials: CategoryDto,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailDto {
    category: &'static str,
    name: String,
    outcome: &'static str,
    target_name: String,
    note: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDto {
    token: String,
    changed: bool,
    details: Vec<DetailDto>,
}

async fn run<T: Send + 'static>(
    app: AppHandle,
    action: impl FnOnce(&mut ConfigurationMergeService<FileConfigurationMergeStorage>) -> MergeResult<T>
    + Send
    + 'static,
) -> Result<T, IpcError> {
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = configuration_gate::lock();
        if !app.state::<SettingsState>().configuration_merge_allowed() {
            return Err("配置目录等待重启切换，请重启后再合并");
        }
        let state = app.state::<ConfigurationMergeState>();
        let mut service = state.0.lock().map_err(|_| "合并状态不可用")?;
        action(&mut service)
    })
    .await
    .map_err(|_| IpcError::new("mergeFailed", "合并任务失败", true))?
    .map_err(|message| IpcError::new("mergeFailed", message, true))
}

#[tauri::command]
pub async fn configuration_merge_select(app: AppHandle) -> Result<Option<ScanDto>, IpcError> {
    let selection =
        native_dialog::pick_folder(app.dialog().file().set_title("选择来源 Qterm 配置目录")).await;
    let Some(selection) = selection else {
        return Ok(None);
    };
    let path = selection
        .into_path()
        .map_err(|_| IpcError::new("mergeFailed", "目录路径无效", false))?;
    run(app, move |s| {
        s.scan(&path).map(|v| {
            Some(ScanDto {
                source: v.source,
                connections: v.connections.into(),
                network: v.network.into(),
                credentials: v.credentials.into(),
            })
        })
    })
    .await
}

#[tauri::command]
pub async fn configuration_merge_preview(
    app: AppHandle,
    input: MergeInput,
) -> Result<PreviewDto, IpcError> {
    let password = input.source_password.map(SecretText::new);
    run(app, move |s| {
        let (token, plan) = s.preview(
            MergeOptions {
                connections: input.connections,
                network: input.network,
                credentials: input.credentials,
            },
            password,
        )?;
        Ok(PreviewDto {
            token,
            changed: plan.changed(),
            details: plan
                .details
                .into_iter()
                .map(|d| DetailDto {
                    category: d.category,
                    name: d.name,
                    outcome: d.outcome,
                    target_name: d.target_name,
                    note: d.note,
                })
                .collect(),
        })
    })
    .await
}

#[tauri::command]
pub async fn configuration_merge_commit(app: AppHandle, token: String) -> Result<(), IpcError> {
    run(app, move |s| s.commit(&token)).await
}

#[tauri::command]
pub async fn configuration_merge_cancel(app: AppHandle) -> Result<(), IpcError> {
    run(app, |s| {
        s.cancel();
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn configuration_merge_unlock_source(
    app: AppHandle,
    password: String,
) -> Result<(), IpcError> {
    let password = SecretText::new(password);
    run(app, move |s| s.unlock_source_credentials(password)).await
}
