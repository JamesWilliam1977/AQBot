mod backup;
mod repair;
mod session_files;
mod sqlite_state;
mod sqlite_status;
mod status;
mod workspace_roots;

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::error::{AQBotError, Result};
use crate::types::CodexSessionVisibilityStatus;

pub use repair::{
    repair_codex_session_visibility, repair_codex_session_visibility_at,
    repair_codex_session_visibility_with_backup, repair_codex_session_visibility_with_backup_at,
};

const DEFAULT_PROVIDER: &str = "openai";
const SESSION_DIRS: [&str; 2] = ["sessions", "archived_sessions"];
const GLOBAL_STATE_FILE: &str = ".codex-global-state.json";
const GLOBAL_STATE_BACKUP_FILE: &str = ".codex-global-state.json.bak";
const STATE_DB_FILE: &str = "state_5.sqlite";

#[derive(Debug, Clone)]
pub(super) struct SessionChange {
    pub path: PathBuf,
    pub relative_path: PathBuf,
    pub original_first_line: String,
    pub updated_first_line: String,
    pub separator: String,
    pub offset: u64,
    pub original_mtime: Option<SystemTime>,
}

#[derive(Debug, Default)]
pub(super) struct SessionScan {
    pub changes: Vec<SessionChange>,
    pub user_event_thread_ids: BTreeSet<String>,
    pub thread_cwd_by_id: BTreeMap<String, String>,
    pub encrypted_content_by_provider: BTreeMap<String, usize>,
}

#[derive(Debug, Default)]
pub(super) struct SqliteUpdateResult {
    pub present: bool,
    pub provider_rows: usize,
    pub user_event_rows: usize,
    pub cwd_rows: usize,
}

#[derive(Debug, Default)]
pub(super) struct SqliteStatus {
    pub present: bool,
    pub rows: usize,
    pub mismatched_rows: usize,
    pub user_event_rows: usize,
    pub cwd_rows: usize,
    pub provider_counts: BTreeMap<String, usize>,
}

impl SqliteUpdateResult {
    pub(super) fn total_rows(&self) -> usize {
        self.provider_rows + self.user_event_rows + self.cwd_rows
    }
}

pub async fn get_codex_session_visibility_status() -> Result<CodexSessionVisibilityStatus> {
    let home = default_codex_home()?;
    get_codex_session_visibility_status_at(&home).await
}

pub async fn get_codex_session_visibility_status_at(
    codex_home: &Path,
) -> Result<CodexSessionVisibilityStatus> {
    status::get_status(codex_home)
}

fn default_codex_home() -> Result<PathBuf> {
    if let Some(value) = std::env::var_os("CODEX_HOME") {
        return Ok(PathBuf::from(value));
    }
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| AQBotError::NotFound("Could not determine home directory".into()))?;
    Ok(home.join(".codex"))
}

fn ensure_codex_home(codex_home: &Path) -> Result<()> {
    if codex_home.exists() {
        Ok(())
    } else {
        Err(AQBotError::NotFound(format!(
            "Codex home not found: {}",
            codex_home.display()
        )))
    }
}

fn read_target_provider(codex_home: &Path) -> Result<String> {
    let config_path = codex_home.join("config.toml");
    let content = match std::fs::read_to_string(&config_path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DEFAULT_PROVIDER.into());
        }
        Err(error) => return Err(AQBotError::Io(error)),
    };
    let doc = content.parse::<toml_edit::DocumentMut>().map_err(|error| {
        AQBotError::Gateway(format!("Failed to parse Codex config.toml: {}", error))
    })?;
    Ok(doc
        .get("model_provider")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DEFAULT_PROVIDER)
        .to_string())
}

fn encrypted_content_warning(
    counts: &BTreeMap<String, usize>,
    target_provider: &str,
) -> Option<String> {
    let risky: Vec<String> = counts
        .iter()
        .filter(|(provider, count)| provider.as_str() != target_provider && **count > 0)
        .map(|(provider, _)| provider.clone())
        .collect();
    if risky.is_empty() {
        None
    } else {
        Some(format!(
            "{} rollout file(s) contain encrypted_content from provider(s) {}. Visibility metadata can be synchronized to {}, but continuing or compacting those histories may fail with invalid_encrypted_content.",
            counts.values().sum::<usize>(),
            risky.join(", "),
            target_provider
        ))
    }
}

pub(super) fn state_db_path(codex_home: &Path) -> PathBuf {
    codex_home.join(STATE_DB_FILE)
}

pub(super) fn json_error(error: serde_json::Error) -> AQBotError {
    AQBotError::Gateway(format!("Failed to process Codex JSON metadata: {}", error))
}
