use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde_json::{json, Value};

use super::{json_error, AQBotError, Result, GLOBAL_STATE_BACKUP_FILE, GLOBAL_STATE_FILE};

pub(super) fn sync_workspace_roots(
    codex_home: &Path,
    cwd_by_id: &BTreeMap<String, String>,
) -> Result<usize> {
    let path = codex_home.join(GLOBAL_STATE_FILE);
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(AQBotError::Io(error)),
    };
    let mut state: Value = serde_json::from_str(&content).map_err(json_error)?;
    let original_state = state.clone();
    let known_cwds = dedupe_paths(cwd_by_id.values().cloned().collect());
    let changed = rewrite_workspace_root_state(&mut state, &known_cwds);
    let backup_missing = !codex_home.join(GLOBAL_STATE_BACKUP_FILE).exists();
    if changed == 0 && state == original_state && !backup_missing {
        return Ok(0);
    }
    let next = format!(
        "{}\n",
        serde_json::to_string_pretty(&state).map_err(json_error)?
    );
    fs::write(&path, &next)?;
    fs::write(codex_home.join(GLOBAL_STATE_BACKUP_FILE), next)?;
    Ok(changed)
}

pub(super) fn preview_workspace_roots(
    codex_home: &Path,
    cwd_by_id: &BTreeMap<String, String>,
) -> Result<usize> {
    let Some(content) = read_global_state_text(codex_home)? else {
        return Ok(0);
    };
    let mut state: Value = serde_json::from_str(&content).map_err(json_error)?;
    let original_state = state.clone();
    let known_cwds = dedupe_paths(cwd_by_id.values().cloned().collect());
    let changed = rewrite_workspace_root_state(&mut state, &known_cwds);
    if state == original_state {
        Ok(0)
    } else {
        Ok(changed.max(1))
    }
}

pub(super) fn read_global_state_text(codex_home: &Path) -> Result<Option<String>> {
    match fs::read_to_string(codex_home.join(GLOBAL_STATE_FILE)) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(AQBotError::Io(error)),
    }
}

pub(super) fn restore_global_state_text(codex_home: &Path, content: Option<&str>) {
    let path = codex_home.join(GLOBAL_STATE_FILE);
    match content {
        Some(content) => {
            let _ = fs::write(path, content);
        }
        None => {
            let _ = fs::remove_file(path);
        }
    }
}

fn rewrite_workspace_root_state(state: &mut Value, known_cwds: &[String]) -> usize {
    let saved = to_path_array(state.get("electron-saved-workspace-roots"));
    let project_order = to_path_array(state.get("project-order"));
    let active = to_path_array(state.get("active-workspace-roots"));
    let next_saved = build_next_saved_roots(&project_order, &saved, &active, known_cwds);
    let next_order = build_next_project_order(&project_order, &saved, &next_saved, known_cwds);
    let next_active = dedupe_paths(resolve_paths(active, known_cwds));
    let changed = count_array_changes(&saved, &next_saved);
    state["electron-saved-workspace-roots"] = json!(next_saved);
    state["project-order"] = json!(next_order);
    rewrite_active_roots(state, next_active);
    rewrite_object_keys(state, "electron-workspace-root-labels", known_cwds);
    rewrite_open_target_preferences(state, known_cwds);
    changed
}

fn build_next_saved_roots(
    project_order: &[String],
    saved: &[String],
    active: &[String],
    known_cwds: &[String],
) -> Vec<String> {
    let mut combined = Vec::new();
    if !project_order.is_empty() {
        combined.extend_from_slice(project_order);
    }
    combined.extend_from_slice(saved);
    combined.extend_from_slice(active);
    dedupe_paths(resolve_paths(combined, known_cwds))
}

fn build_next_project_order(
    project_order: &[String],
    saved: &[String],
    next_saved: &[String],
    known_cwds: &[String],
) -> Vec<String> {
    if project_order.is_empty() {
        return next_saved.to_vec();
    }
    let mut combined = Vec::new();
    combined.extend_from_slice(project_order);
    combined.extend_from_slice(saved);
    dedupe_paths(resolve_paths(combined, known_cwds))
}

fn rewrite_active_roots(state: &mut Value, next_active: Vec<String>) {
    let original_is_array = state
        .get("active-workspace-roots")
        .map(Value::is_array)
        .unwrap_or(false);
    if original_is_array {
        state["active-workspace-roots"] = json!(next_active);
    } else if let Some(first) = next_active.first() {
        state["active-workspace-roots"] = json!(first);
    }
}

fn rewrite_object_keys(state: &mut Value, key: &str, known_cwds: &[String]) {
    let Some(object) = state.get(key).and_then(Value::as_object) else {
        return;
    };
    let mut next = serde_json::Map::new();
    for (path, value) in object {
        next.insert(resolve_stored_path(path, known_cwds), value.clone());
    }
    state[key] = Value::Object(next);
}

fn rewrite_open_target_preferences(state: &mut Value, known_cwds: &[String]) {
    let Some(preferences) = state.get_mut("open-in-target-preferences") else {
        return;
    };
    let Some(per_path) = preferences.get_mut("perPath") else {
        return;
    };
    let Some(object) = per_path.as_object() else {
        return;
    };
    let mut next = serde_json::Map::new();
    for (path, value) in object {
        next.insert(resolve_stored_path(path, known_cwds), value.clone());
    }
    *per_path = Value::Object(next);
}

fn to_path_array(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
            .collect(),
        Some(Value::String(value)) if !value.trim().is_empty() => vec![value.to_string()],
        _ => Vec::new(),
    }
}

fn resolve_paths(paths: Vec<String>, known_cwds: &[String]) -> Vec<String> {
    paths
        .into_iter()
        .map(|path| resolve_stored_path(&path, known_cwds))
        .collect()
}

fn resolve_stored_path(value: &str, known_cwds: &[String]) -> String {
    let comparable = normalize_comparable_path(value);
    known_cwds
        .iter()
        .find(|cwd| normalize_comparable_path(cwd) == comparable)
        .cloned()
        .unwrap_or_else(|| to_desktop_workspace_path(value))
}

fn dedupe_paths(paths: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for path in paths {
        let comparable = normalize_comparable_path(&path);
        if !comparable.is_empty() && seen.insert(comparable) {
            result.push(path);
        }
    }
    result
}

fn count_array_changes(previous: &[String], next: &[String]) -> usize {
    let count = previous.len().max(next.len());
    (0..count)
        .filter(|index| previous.get(*index) != next.get(*index))
        .count()
}

fn normalize_comparable_path(value: &str) -> String {
    let mut normalized = to_desktop_workspace_path(value).trim().replace('/', "\\");
    while normalized.ends_with('\\') && normalized.len() > 3 {
        normalized.pop();
    }
    normalized.to_lowercase()
}

pub(super) fn to_desktop_workspace_path(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(rest) = trimmed.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{}", rest).replace('/', "\\");
    }
    if let Some(rest) = trimmed.strip_prefix(r"\\?\") {
        return rest.replace('/', "\\");
    }
    trimmed.trim_end_matches(['/', '\\']).to_string()
}

pub(super) fn restore_global_state(codex_home: &Path, backup_path: &Path) {
    if backup_path.exists() {
        let _ = fs::copy(backup_path, codex_home.join(GLOBAL_STATE_FILE));
    }
}
