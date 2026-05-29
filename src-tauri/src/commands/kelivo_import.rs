use crate::AppState;
use aqbot_core::repo::kelivo_import::{
    ThirdPartyImportOptions, ThirdPartyImportResult, ThirdPartyImportSummary,
};
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn scan_kelivo_import(
    state: State<'_, AppState>,
    path: String,
) -> Result<ThirdPartyImportSummary, String> {
    aqbot_core::repo::kelivo_import::scan_kelivo_import_from_path(
        &state.sea_db,
        &PathBuf::from(path),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_kelivo_backup(
    state: State<'_, AppState>,
    path: String,
    options: ThirdPartyImportOptions,
) -> Result<ThirdPartyImportResult, String> {
    aqbot_core::repo::kelivo_import::import_kelivo_backup_from_path(
        &state.sea_db,
        &state.master_key,
        &PathBuf::from(path),
        options,
    )
    .await
    .map_err(|e| e.to_string())
}
