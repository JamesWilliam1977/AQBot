use std::fs::{self, File, FileTimes};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use super::{json_error, workspace_roots, Result, SessionChange, SessionScan, SESSION_DIRS};
use serde_json::Value;

#[derive(Debug, Clone)]
struct FirstLineRecord {
    first_line: String,
    separator: String,
    offset: u64,
}

pub(super) fn collect_session_changes(
    codex_home: &Path,
    target_provider: &str,
) -> Result<SessionScan> {
    let mut scan = SessionScan::default();
    for dir_name in SESSION_DIRS {
        let root = codex_home.join(dir_name);
        if root.exists() {
            for path in list_rollout_files(&root)? {
                collect_rollout_change(codex_home, &path, target_provider, &mut scan)?;
            }
        }
    }
    Ok(scan)
}

fn collect_rollout_change(
    codex_home: &Path,
    path: &Path,
    target_provider: &str,
    scan: &mut SessionScan,
) -> Result<()> {
    let record = read_first_line_record(path)?;
    let mut meta = parse_session_meta(&record.first_line)?;
    if meta.is_null() {
        return Ok(());
    }
    let payload = meta.get_mut("payload").and_then(Value::as_object_mut);
    let Some(payload) = payload else {
        return Ok(());
    };
    let current_provider = payload
        .get("model_provider")
        .and_then(Value::as_str)
        .unwrap_or("(missing)")
        .to_string();
    record_rollout_facts(path, &record, payload, &current_provider, scan)?;
    if current_provider != target_provider {
        payload.insert(
            "model_provider".into(),
            Value::String(target_provider.into()),
        );
        scan.changes
            .push(build_change(codex_home, path, record, meta)?);
    }
    Ok(())
}

fn build_change(
    codex_home: &Path,
    path: &Path,
    record: FirstLineRecord,
    meta: Value,
) -> Result<SessionChange> {
    Ok(SessionChange {
        path: path.to_path_buf(),
        relative_path: path.strip_prefix(codex_home).unwrap_or(path).to_path_buf(),
        original_first_line: record.first_line,
        updated_first_line: serde_json::to_string(&meta).map_err(json_error)?,
        separator: record.separator,
        offset: record.offset,
        original_mtime: fs::metadata(path)
            .ok()
            .and_then(|meta| meta.modified().ok()),
    })
}

fn record_rollout_facts(
    path: &Path,
    record: &FirstLineRecord,
    payload: &serde_json::Map<String, Value>,
    provider: &str,
    scan: &mut SessionScan,
) -> Result<()> {
    let thread_id = payload
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !thread_id.is_empty() {
        record_thread_cwd(payload, thread_id, scan);
        if file_has_user_event(path, &record.first_line, record.offset)? {
            scan.user_event_thread_ids.insert(thread_id.into());
        }
    }
    if file_has_encrypted_content(path, &record.first_line, record.offset)? {
        *scan
            .encrypted_content_by_provider
            .entry(provider.to_string())
            .or_default() += 1;
    }
    Ok(())
}

fn record_thread_cwd(
    payload: &serde_json::Map<String, Value>,
    thread_id: &str,
    scan: &mut SessionScan,
) {
    let Some(cwd) = payload.get("cwd").and_then(Value::as_str) else {
        return;
    };
    if !cwd.trim().is_empty() {
        scan.thread_cwd_by_id.insert(
            thread_id.into(),
            workspace_roots::to_desktop_workspace_path(cwd),
        );
    }
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

fn read_first_line_record(path: &Path) -> Result<FirstLineRecord> {
    let mut file = File::open(path)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    let newline = bytes.iter().position(|byte| *byte == b'\n');
    let (line_bytes, separator, offset) = match newline {
        Some(index) if index > 0 && bytes[index - 1] == b'\r' => {
            (&bytes[..index - 1], "\r\n".to_string(), index as u64 + 1)
        }
        Some(index) => (&bytes[..index], "\n".to_string(), index as u64 + 1),
        None => (&bytes[..], String::new(), bytes.len() as u64),
    };
    Ok(FirstLineRecord {
        first_line: String::from_utf8_lossy(line_bytes).to_string(),
        separator,
        offset,
    })
}

fn parse_session_meta(first_line: &str) -> Result<Value> {
    if first_line.trim().is_empty() {
        return Ok(Value::Null);
    }
    let parsed: Value = serde_json::from_str(first_line).map_err(json_error)?;
    if parsed.get("type").and_then(Value::as_str) == Some("session_meta")
        && parsed.get("payload").is_some()
    {
        Ok(parsed)
    } else {
        Ok(Value::Null)
    }
}

fn file_has_encrypted_content(path: &Path, first_line: &str, offset: u64) -> Result<bool> {
    Ok(first_line.contains("encrypted_content")
        || file_tail_contains(path, offset, "encrypted_content")?)
}

fn file_tail_contains(path: &Path, offset: u64, needle: &str) -> Result<bool> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content.contains(needle))
}

fn file_has_user_event(path: &Path, first_line: &str, offset: u64) -> Result<bool> {
    if line_has_user_event(first_line) {
        return Ok(true);
    }
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    Ok(content.lines().any(line_has_user_event))
}

fn line_has_user_event(line: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return false;
    };
    let event_msg = value.get("type").and_then(Value::as_str) == Some("event_msg")
        && value
            .get("payload")
            .and_then(|payload| payload.get("type"))
            .and_then(Value::as_str)
            == Some("user_message");
    event_msg
        || ["payload", "item", "msg"]
            .iter()
            .any(|key| user_message_at(&value, key))
}

fn user_message_at(value: &Value, key: &str) -> bool {
    let Some(message) = value.get(key) else {
        return false;
    };
    message.get("type").and_then(Value::as_str) == Some("message")
        && message.get("role").and_then(Value::as_str) == Some("user")
}

pub(super) fn apply_session_changes(
    changes: &[SessionChange],
    applied: &mut Vec<SessionChange>,
) -> Result<usize> {
    let mut changed = 0;
    for change in changes {
        if rewrite_collected_first_line(change)? {
            changed += 1;
            applied.push(change.clone());
        }
    }
    Ok(changed)
}

fn rewrite_collected_first_line(change: &SessionChange) -> Result<bool> {
    let current = read_first_line_record(&change.path)?;
    if current.first_line != change.original_first_line || current.offset != change.offset {
        return Ok(false);
    }
    let tmp_path = change.path.with_extension(format!(
        "aqbot-session-visibility-{}.tmp",
        chrono::Utc::now().timestamp_millis()
    ));
    rewrite_first_line_to_tmp(change, &tmp_path)?;
    fs::rename(&tmp_path, &change.path)?;
    restore_mtime(&change.path, change.original_mtime);
    Ok(true)
}

fn rewrite_first_line_to_tmp(change: &SessionChange, tmp_path: &Path) -> Result<()> {
    let mut source = File::open(&change.path)?;
    source.seek(SeekFrom::Start(change.offset))?;
    let mut tmp = File::create(tmp_path)?;
    tmp.write_all(change.updated_first_line.as_bytes())?;
    tmp.write_all(change.separator.as_bytes())?;
    std::io::copy(&mut source, &mut tmp)?;
    tmp.flush()?;
    Ok(())
}

pub(super) fn restore_applied_changes(changes: &[SessionChange]) {
    for change in changes {
        let _ = rewrite_first_line(&change.path, &change.original_first_line, &change.separator);
        restore_mtime(&change.path, change.original_mtime);
    }
}

fn rewrite_first_line(path: &Path, first_line: &str, separator: &str) -> Result<()> {
    let current = read_first_line_record(path)?;
    let tmp_path = path.with_extension("aqbot-session-visibility-restore.tmp");
    let mut source = File::open(path)?;
    source.seek(SeekFrom::Start(current.offset))?;
    let mut tmp = File::create(&tmp_path)?;
    tmp.write_all(first_line.as_bytes())?;
    tmp.write_all(separator.as_bytes())?;
    std::io::copy(&mut source, &mut tmp)?;
    tmp.flush()?;
    fs::rename(tmp_path, path)?;
    Ok(())
}

fn restore_mtime(path: &Path, modified: Option<std::time::SystemTime>) {
    let Some(modified) = modified else { return };
    let Ok(file) = File::options().write(true).open(path) else {
        return;
    };
    let _ = file.set_times(FileTimes::new().set_modified(modified));
}
