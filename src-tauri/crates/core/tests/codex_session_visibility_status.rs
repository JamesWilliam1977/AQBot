use std::path::{Path, PathBuf};

use aqbot_core::repo::codex_session_visibility::{
    get_codex_session_visibility_status_at, repair_codex_session_visibility_with_backup_at,
};
use sea_orm::{ConnectionTrait, Database, DbBackend, Statement};
use serde_json::json;

fn codex_home_root() -> PathBuf {
    std::env::temp_dir().join(format!(
        "aqbot-codex-session-status-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ))
}

fn write_text(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("create parent");
    }
    std::fs::write(path, content).expect("write fixture");
}

fn rollout_path(codex_home: &Path, dir: &str, thread: &str) -> PathBuf {
    codex_home
        .join(dir)
        .join("2026")
        .join("06")
        .join("09")
        .join(format!("rollout-{thread}.jsonl"))
}

fn write_rollout(path: &Path, thread_id: &str, provider: &str, cwd: &str, user: bool) {
    let timestamp = "2026-06-09T00:00:00.000Z";
    let mut lines = vec![json!({
        "timestamp": timestamp, "type": "session_meta",
        "payload": { "id": thread_id, "timestamp": timestamp, "cwd": cwd,
            "source": "cli", "cli_version": "0.121.0", "model_provider": provider }
    })
    .to_string()];
    if user {
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
            "payload": { "type": "assistant_message", "encrypted_content": "cipher" }
        })
        .to_string(),
    );
    write_text(path, &format!("{}\n", lines.join("\n")));
}

async fn create_state_db(codex_home: &Path) {
    let db_path = codex_home.join("state_5.sqlite");
    let db = Database::connect(format!("sqlite://{}?mode=rwc", db_path.display()))
        .await
        .expect("connect sqlite");
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        r#"CREATE TABLE threads (
            id TEXT PRIMARY KEY,
            model_provider TEXT,
            cwd TEXT NOT NULL DEFAULT '',
            has_user_event INTEGER NOT NULL DEFAULT 0,
            updated_at_ms INTEGER NOT NULL DEFAULT 0
        )"#
        .to_string(),
    ))
    .await
    .expect("create threads");
    db.execute(Statement::from_string(
        DbBackend::Sqlite,
        r#"INSERT INTO threads
          (id, model_provider, cwd, has_user_event, updated_at_ms)
        VALUES
          ('thread-a', 'any', '/tmp/project-alpha', 1, 123),
          ('thread-b', 'openai', '', 0, 456)"#
            .to_string(),
    ))
    .await
    .expect("insert threads");
}

#[tokio::test]
async fn status_reports_mismatched_rollouts_sqlite_and_workspace_roots_without_writes() {
    let codex_home = codex_home_root();
    write_text(
        &codex_home.join("config.toml"),
        "model_provider = \"any\"\n",
    );
    write_rollout(
        &rollout_path(&codex_home, "sessions", "thread-a"),
        "thread-a",
        "any",
        "/tmp/project-alpha",
        true,
    );
    write_rollout(
        &rollout_path(&codex_home, "archived_sessions", "thread-b"),
        "thread-b",
        "openai",
        "/tmp/project-beta",
        true,
    );
    write_text(
        &codex_home.join(".codex-global-state.json"),
        r#"{"electron-saved-workspace-roots":["/tmp/project-alpha/"],"project-order":[]}"#,
    );
    create_state_db(&codex_home).await;

    let status = get_codex_session_visibility_status_at(&codex_home)
        .await
        .expect("status succeeds");

    assert_eq!(status.target_provider, "any");
    assert_eq!(status.total_session_files, 2);
    assert_eq!(status.mismatched_session_files, 1);
    assert!(status.sqlite_present);
    assert_eq!(status.sqlite_rows, 2);
    assert_eq!(status.sqlite_mismatched_rows, 1);
    assert_eq!(status.sqlite_user_event_rows_needing_repair, 1);
    assert_eq!(status.sqlite_cwd_rows_needing_repair, 1);
    assert_eq!(status.workspace_roots_needing_update, 1);
    assert!(status
        .status_rows
        .iter()
        .any(|row| row.scope == "archived_sessions"
            && row.provider.as_deref() == Some("openai")
            && row.mismatched_count == 1));
    assert!(!codex_home.join(".codex-global-state.json.bak").exists());

    let _ = std::fs::remove_dir_all(codex_home);
}

#[tokio::test]
async fn repair_can_skip_persistent_backup_when_requested() {
    let codex_home = codex_home_root();
    write_text(
        &codex_home.join("config.toml"),
        "model_provider = \"any\"\n",
    );
    write_rollout(
        &rollout_path(&codex_home, "sessions", "thread-a"),
        "thread-a",
        "openai",
        "/tmp/project-alpha",
        true,
    );

    let result = repair_codex_session_visibility_with_backup_at(&codex_home, false)
        .await
        .expect("repair succeeds");

    assert_eq!(result.changed_session_files, 1);
    assert!(result.backup_dir.is_none());
    assert!(!codex_home.join("backups_state").exists());

    let _ = std::fs::remove_dir_all(codex_home);
}
