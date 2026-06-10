use std::path::{Path, PathBuf};

use aqbot_core::repo::codex_session_visibility::repair_codex_session_visibility_at;
use sea_orm::{ConnectionTrait, Database, DbBackend, Statement};
use serde_json::{json, Value};
fn codex_home_root() -> PathBuf {
    std::env::temp_dir().join(format!(
        "aqbot-codex-session-visibility-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ))
}
fn write_text(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("create parent dir");
    }
    std::fs::write(path, content).expect("write text fixture");
}
fn write_json(path: &Path, value: &Value) {
    let content = serde_json::to_string_pretty(value).expect("serialize json fixture");
    write_text(path, &content);
}
fn rollout_path(codex_home: &Path, dir: &str, day: &str, thread: &str) -> PathBuf {
    codex_home
        .join(dir)
        .join("2026")
        .join("06")
        .join(day)
        .join(format!("rollout-{thread}.jsonl"))
}
fn write_rollout(path: &Path, thread_id: &str, provider: &str, cwd: &str, include_user: bool) {
    let timestamp = "2026-06-09T00:00:00.000Z";
    let mut lines = vec![json!({
        "timestamp": timestamp, "type": "session_meta",
        "payload": { "id": thread_id, "timestamp": timestamp, "cwd": cwd,
            "source": "cli", "cli_version": "0.121.0", "model_provider": provider }
    })
    .to_string()];

    if include_user {
        lines.push(
            json!({
                "timestamp": timestamp, "type": "event_msg",
                "payload": { "type": "user_message", "message": "hello" }
            })
            .to_string(),
        );
    }
    lines.push(
        json!({
            "timestamp": timestamp, "type": "event_msg",
            "payload": { "type": "assistant_message", "encrypted_content": "ciphertext" }
        })
        .to_string(),
    );
    write_text(path, &format!("{}\n", lines.join("\n")));
}
fn first_line_json(path: &Path) -> Value {
    let content = std::fs::read_to_string(path).expect("read rollout");
    let first_line = content.lines().next().expect("rollout first line");
    serde_json::from_str(first_line).expect("parse rollout first line")
}
async fn create_state_db(codex_home: &Path) {
    let db_path = codex_home.join("state_5.sqlite");
    let db = Database::connect(format!("sqlite://{}?mode=rwc", db_path.display()))
        .await
        .expect("connect state db");
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        r#"CREATE TABLE threads (
            id TEXT PRIMARY KEY,
            model_provider TEXT,
            cwd TEXT NOT NULL DEFAULT '',
            archived INTEGER NOT NULL DEFAULT 0,
            has_user_event INTEGER NOT NULL DEFAULT 0,
            first_user_message TEXT NOT NULL DEFAULT '',
            updated_at_ms INTEGER NOT NULL DEFAULT 0
        )"#
        .to_string(),
    ))
    .await
    .expect("create threads");
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        r#"INSERT INTO threads
          (id, model_provider, cwd, archived, has_user_event, first_user_message, updated_at_ms)
        VALUES
          ('thread-a', 'openai', '', 0, 0, 'hello', 123),
          ('thread-b', 'old-provider', '', 1, 0, 'archived', 456)"#
            .to_string(),
    ))
    .await
    .expect("insert threads");
}
async fn read_thread_rows(codex_home: &Path) -> Vec<(String, String, String, i64, i64)> {
    let db_path = codex_home.join("state_5.sqlite");
    let db = Database::connect(format!("sqlite://{}?mode=ro", db_path.display()))
        .await
        .expect("connect state db read");
    let rows = db
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT id, model_provider, cwd, has_user_event, updated_at_ms FROM threads ORDER BY id"
                .to_string(),
        ))
        .await
        .expect("query threads");

    rows.into_iter()
        .map(|row| {
            (
                row.try_get::<String>("", "id").expect("id"),
                row.try_get::<String>("", "model_provider")
                    .expect("model_provider"),
                row.try_get::<String>("", "cwd").expect("cwd"),
                row.try_get::<i64>("", "has_user_event")
                    .expect("has_user_event"),
                row.try_get::<i64>("", "updated_at_ms")
                    .expect("updated_at_ms"),
            )
        })
        .collect()
}
#[tokio::test]
async fn codex_session_visibility_syncs_rollouts_sqlite_and_global_state() {
    let codex_home = codex_home_root();
    let active_rollout = rollout_path(&codex_home, "sessions", "09", "thread-a");
    let archived_rollout = rollout_path(&codex_home, "archived_sessions", "08", "thread-b");
    write_text(
        &codex_home.join("config.toml"),
        r#"model_provider = "any"

[model_providers.any]
base_url = "http://localhost:1234/v1"
"#,
    );
    write_json(
        &codex_home.join("auth.json"),
        &json!({ "OPENAI_API_KEY": "keep-me" }),
    );
    write_rollout(
        &active_rollout,
        "thread-a",
        "openai",
        "/tmp/project-alpha",
        true,
    );
    write_rollout(
        &archived_rollout,
        "thread-b",
        "old-provider",
        "/tmp/project-alpha",
        false,
    );
    write_json(
        &codex_home.join(".codex-global-state.json"),
        &json!({
            "electron-saved-workspace-roots": ["/tmp/project-alpha/"],
            "project-order": [],
            "active-workspace-roots": "/tmp/project-alpha/"
        }),
    );
    create_state_db(&codex_home).await;

    let result = repair_codex_session_visibility_at(&codex_home)
        .await
        .expect("repair succeeds");

    assert_eq!(result.target_provider, "any");
    assert_eq!(result.changed_session_files, 2);
    assert_eq!(result.skipped_locked_session_files, 0);
    assert_eq!(result.sqlite_provider_rows_updated, 2);
    assert_eq!(result.sqlite_user_event_rows_updated, 1);
    assert_eq!(result.sqlite_cwd_rows_updated, 2);
    assert_eq!(result.updated_workspace_roots, 1);
    assert!(result
        .backup_dir
        .as_deref()
        .expect("backup dir")
        .contains("aqbot-session-visibility"));
    assert!(result
        .encrypted_content_warning
        .as_deref()
        .expect("encrypted content warning")
        .contains("encrypted_content"));

    assert_eq!(
        first_line_json(&active_rollout)["payload"]["model_provider"],
        "any"
    );
    assert_eq!(
        first_line_json(&archived_rollout)["payload"]["model_provider"],
        "any"
    );
    let active_content = std::fs::read_to_string(&active_rollout).expect("read active rollout");
    assert!(active_content.contains("encrypted_content"));

    let rows = read_thread_rows(&codex_home).await;
    assert_eq!(
        rows,
        vec![
            (
                "thread-a".into(),
                "any".into(),
                "/tmp/project-alpha".into(),
                1,
                123
            ),
            (
                "thread-b".into(),
                "any".into(),
                "/tmp/project-alpha".into(),
                0,
                456
            ),
        ]
    );
    assert_eq!(
        std::fs::read_to_string(codex_home.join("auth.json")).expect("read auth"),
        "{\n  \"OPENAI_API_KEY\": \"keep-me\"\n}"
    );

    let global_state = serde_json::from_str::<Value>(
        &std::fs::read_to_string(codex_home.join(".codex-global-state.json"))
            .expect("read global state"),
    )
    .expect("parse global state");
    assert_eq!(
        global_state["electron-saved-workspace-roots"],
        json!(["/tmp/project-alpha"])
    );
    assert!(codex_home.join(".codex-global-state.json.bak").exists());

    let _ = std::fs::remove_dir_all(codex_home);
}

#[tokio::test]
async fn codex_session_visibility_succeeds_when_sqlite_is_missing() {
    let codex_home = codex_home_root();
    let rollout = rollout_path(&codex_home, "sessions", "09", "thread-a");

    write_text(
        &codex_home.join("config.toml"),
        "sandbox_mode = \"workspace-write\"\n",
    );
    write_rollout(
        &rollout,
        "thread-a",
        "old-provider",
        "/tmp/project-beta",
        true,
    );

    let result = repair_codex_session_visibility_at(&codex_home)
        .await
        .expect("repair succeeds without sqlite");

    assert_eq!(result.target_provider, "openai");
    assert_eq!(result.changed_session_files, 1);
    assert!(!result.sqlite_present);
    assert_eq!(
        first_line_json(&rollout)["payload"]["model_provider"],
        "openai"
    );

    let _ = std::fs::remove_dir_all(codex_home);
}

#[tokio::test]
async fn codex_session_visibility_does_not_rewrite_rollout_when_sqlite_is_malformed() {
    let codex_home = codex_home_root();
    let rollout = rollout_path(&codex_home, "sessions", "09", "thread-a");

    write_text(
        &codex_home.join("config.toml"),
        "model_provider = \"any\"\n",
    );
    write_rollout(
        &rollout,
        "thread-a",
        "old-provider",
        "/tmp/project-gamma",
        true,
    );
    write_text(&codex_home.join("state_5.sqlite"), "not a sqlite database");

    let error = repair_codex_session_visibility_at(&codex_home)
        .await
        .expect_err("malformed sqlite stops repair");

    assert!(error.to_string().contains("state_5.sqlite"));
    assert_eq!(
        first_line_json(&rollout)["payload"]["model_provider"],
        "old-provider"
    );

    let _ = std::fs::remove_dir_all(codex_home);
}
