use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde_json::json;

use super::{
    json_error, Result, SessionChange, GLOBAL_STATE_BACKUP_FILE, GLOBAL_STATE_FILE, STATE_DB_FILE,
};

pub(super) fn create_backup(codex_home: &Path, changes: &[SessionChange]) -> Result<PathBuf> {
    let backup_dir = codex_home
        .join("backups_state")
        .join("aqbot-session-visibility")
        .join(Utc::now().format("%Y%m%d-%H%M%S-%3f").to_string());
    fs::create_dir_all(&backup_dir)?;
    for change in changes {
        copy_if_exists(&change.path, &backup_dir.join(&change.relative_path))?;
    }
    for file_name in [STATE_DB_FILE, GLOBAL_STATE_FILE, GLOBAL_STATE_BACKUP_FILE] {
        copy_if_exists(&codex_home.join(file_name), &backup_dir.join(file_name))?;
    }
    write_backup_metadata(&backup_dir, changes.len())?;
    Ok(backup_dir)
}

fn copy_if_exists(src: &Path, dest: &Path) -> Result<()> {
    if !src.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(src, dest)?;
    Ok(())
}

fn write_backup_metadata(backup_dir: &Path, changed_files: usize) -> Result<()> {
    let content = serde_json::to_string_pretty(&json!({
        "version": 1,
        "namespace": "aqbot-session-visibility",
        "createdAt": Utc::now().to_rfc3339(),
        "changedSessionFiles": changed_files
    }))
    .map_err(json_error)?;
    fs::write(backup_dir.join("metadata.json"), content)?;
    Ok(())
}
