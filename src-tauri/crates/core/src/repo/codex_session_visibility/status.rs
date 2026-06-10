use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::{
    encrypted_content_warning, ensure_codex_home, json_error, read_target_provider, session_files,
    sqlite_status, workspace_roots, Result, SESSION_DIRS,
};
use crate::types::{CodexSessionVisibilityStatus, CodexSessionVisibilityStatusRow};

#[derive(Debug, Default)]
struct SessionProviderCounts {
    counts: BTreeMap<(String, String), usize>,
    total: usize,
}

pub(super) fn get_status(codex_home: &Path) -> Result<CodexSessionVisibilityStatus> {
    ensure_codex_home(codex_home)?;
    let target_provider = read_target_provider(codex_home)?;
    let scan = session_files::collect_session_changes(codex_home, &target_provider)?;
    let session_counts = collect_session_provider_counts(codex_home)?;
    let sqlite = sqlite_status::read_sqlite_status(codex_home, &target_provider, &scan)?;
    let workspace_roots =
        workspace_roots::preview_workspace_roots(codex_home, &scan.thread_cwd_by_id)?;
    let mut rows = build_session_rows(&session_counts.counts, &target_provider);
    rows.extend(build_provider_rows(
        "state_5.sqlite",
        &sqlite.provider_counts,
        &target_provider,
    ));
    if workspace_roots > 0 {
        rows.push(CodexSessionVisibilityStatusRow {
            scope: ".codex-global-state.json".into(),
            provider: None,
            count: workspace_roots,
            mismatched_count: workspace_roots,
            status: "needs_repair".into(),
        });
    }

    Ok(CodexSessionVisibilityStatus {
        target_provider: target_provider.clone(),
        codex_home: codex_home.display().to_string(),
        total_session_files: session_counts.total,
        mismatched_session_files: scan.changes.len(),
        sqlite_present: sqlite.present,
        sqlite_rows: sqlite.rows,
        sqlite_mismatched_rows: sqlite.mismatched_rows,
        sqlite_user_event_rows_needing_repair: sqlite.user_event_rows,
        sqlite_cwd_rows_needing_repair: sqlite.cwd_rows,
        workspace_roots_needing_update: workspace_roots,
        status_rows: rows,
        encrypted_content_warning: encrypted_content_warning(
            &scan.encrypted_content_by_provider,
            &target_provider,
        ),
    })
}

fn build_session_rows(
    counts: &BTreeMap<(String, String), usize>,
    target_provider: &str,
) -> Vec<CodexSessionVisibilityStatusRow> {
    counts
        .iter()
        .map(|((scope, provider), count)| provider_row(scope, provider, *count, target_provider))
        .collect()
}

fn build_provider_rows(
    scope: &str,
    counts: &BTreeMap<String, usize>,
    target_provider: &str,
) -> Vec<CodexSessionVisibilityStatusRow> {
    counts
        .iter()
        .map(|(provider, count)| provider_row(scope, provider, *count, target_provider))
        .collect()
}

fn provider_row(
    scope: &str,
    provider: &str,
    count: usize,
    target_provider: &str,
) -> CodexSessionVisibilityStatusRow {
    let mismatched_count = if provider == target_provider {
        0
    } else {
        count
    };
    CodexSessionVisibilityStatusRow {
        scope: scope.into(),
        provider: Some(provider.into()),
        count,
        mismatched_count,
        status: if mismatched_count == 0 {
            "ok"
        } else {
            "needs_repair"
        }
        .into(),
    }
}

fn collect_session_provider_counts(codex_home: &Path) -> Result<SessionProviderCounts> {
    let mut result = SessionProviderCounts::default();
    for dir_name in SESSION_DIRS {
        let root = codex_home.join(dir_name);
        if root.exists() {
            for path in list_rollout_files(&root)? {
                collect_file_provider(dir_name, &path, &mut result)?;
            }
        }
    }
    Ok(result)
}

fn collect_file_provider(
    scope: &str,
    path: &Path,
    counts: &mut SessionProviderCounts,
) -> Result<()> {
    let Some(first_line) = read_first_line(path)? else {
        return Ok(());
    };
    let parsed: Value = serde_json::from_str(&first_line).map_err(json_error)?;
    if parsed.get("type").and_then(Value::as_str) != Some("session_meta") {
        return Ok(());
    }
    let provider = parsed
        .get("payload")
        .and_then(|payload| payload.get("model_provider"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("(missing)")
        .to_string();
    *counts.counts.entry((scope.into(), provider)).or_default() += 1;
    counts.total += 1;
    Ok(())
}

fn list_rollout_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    list_rollout_files_into(root, &mut files)?;
    files.sort();
    Ok(files)
}

fn list_rollout_files_into(root: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            list_rollout_files_into(&path, files)?;
        } else if file_type.is_file() && is_rollout_file(&path) {
            files.push(path);
        }
    }
    Ok(())
}

fn is_rollout_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with("rollout-") && name.ends_with(".jsonl"))
        .unwrap_or(false)
}

fn read_first_line(path: &Path) -> Result<Option<String>> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut first_line = String::new();
    if reader.read_line(&mut first_line)? == 0 {
        return Ok(None);
    }
    Ok(Some(first_line.trim_end_matches(['\r', '\n']).to_string()))
}
