use std::path::{Path, PathBuf};

use crate::error::Result;
use crate::types::CodexSessionVisibilityRepairResult;

use super::{
    backup, default_codex_home, encrypted_content_warning, ensure_codex_home, read_target_provider,
    session_files, sqlite_state, state_db_path, workspace_roots, SessionChange, SessionScan,
    SqliteUpdateResult, GLOBAL_STATE_FILE,
};

pub async fn repair_codex_session_visibility() -> Result<CodexSessionVisibilityRepairResult> {
    let home = default_codex_home()?;
    repair_codex_session_visibility_with_backup_at(&home, true).await
}

pub async fn repair_codex_session_visibility_at(
    codex_home: &Path,
) -> Result<CodexSessionVisibilityRepairResult> {
    repair_codex_session_visibility_with_backup_at(codex_home, true).await
}

pub async fn repair_codex_session_visibility_with_backup(
    create_backup: bool,
) -> Result<CodexSessionVisibilityRepairResult> {
    let home = default_codex_home()?;
    repair_codex_session_visibility_with_backup_at(&home, create_backup).await
}

pub async fn repair_codex_session_visibility_with_backup_at(
    codex_home: &Path,
    create_backup: bool,
) -> Result<CodexSessionVisibilityRepairResult> {
    ensure_codex_home(codex_home)?;
    let target_provider = read_target_provider(codex_home)?;
    let scan = session_files::collect_session_changes(codex_home, &target_provider)?;
    sqlite_state::assert_sqlite_writable(codex_home)?;
    let backup_dir = if create_backup {
        Some(backup::create_backup(codex_home, &scan.changes)?)
    } else {
        None
    };

    let mut sqlite_result = SqliteUpdateResult::default();
    let mut applied_changes: Vec<SessionChange> = Vec::new();
    let global_state_backup = backup_dir.as_ref().map(|path| path.join(GLOBAL_STATE_FILE));
    let global_state_original = if create_backup {
        None
    } else {
        workspace_roots::read_global_state_text(codex_home)?
    };
    let mut global_state_updated = false;

    match apply_repair(
        codex_home,
        &target_provider,
        &scan,
        &mut sqlite_result,
        &mut applied_changes,
        &mut global_state_updated,
    ) {
        Ok(updated_workspace_roots) => Ok(build_result(
            target_provider,
            scan,
            sqlite_result,
            updated_workspace_roots,
            backup_dir,
        )),
        Err(error) => {
            session_files::restore_applied_changes(&applied_changes);
            restore_global_state(
                codex_home,
                global_state_updated,
                global_state_backup.as_ref(),
                global_state_original.as_deref(),
            );
            Err(error)
        }
    }
}

fn restore_global_state(
    codex_home: &Path,
    updated: bool,
    backup_path: Option<&PathBuf>,
    original: Option<&str>,
) {
    if !updated {
        return;
    }
    if let Some(backup_path) = backup_path {
        workspace_roots::restore_global_state(codex_home, backup_path);
    } else {
        workspace_roots::restore_global_state_text(codex_home, original);
    }
}

fn apply_repair(
    codex_home: &Path,
    target_provider: &str,
    scan: &SessionScan,
    sqlite_result: &mut SqliteUpdateResult,
    applied_changes: &mut Vec<SessionChange>,
    global_state_updated: &mut bool,
) -> Result<usize> {
    if state_db_path(codex_home).exists() {
        return apply_repair_with_sqlite(
            codex_home,
            target_provider,
            scan,
            sqlite_result,
            applied_changes,
            global_state_updated,
        );
    }
    session_files::apply_session_changes(&scan.changes, applied_changes)?;
    let updated_roots = workspace_roots::sync_workspace_roots(codex_home, &scan.thread_cwd_by_id)?;
    *global_state_updated = updated_roots > 0;
    *sqlite_result = SqliteUpdateResult::default();
    Ok(updated_roots)
}

fn apply_repair_with_sqlite(
    codex_home: &Path,
    target_provider: &str,
    scan: &SessionScan,
    sqlite_result: &mut SqliteUpdateResult,
    applied_changes: &mut Vec<SessionChange>,
    global_state_updated: &mut bool,
) -> Result<usize> {
    let db = sqlite_state::SqliteDb::open(&state_db_path(codex_home))?;
    db.exec("BEGIN IMMEDIATE")?;
    let result = apply_repair_with_open_tx(
        codex_home,
        target_provider,
        scan,
        &db,
        applied_changes,
        global_state_updated,
    );
    match result {
        Ok((sqlite_stats, updated_roots)) => {
            db.exec("COMMIT")?;
            *sqlite_result = sqlite_stats;
            Ok(updated_roots)
        }
        Err(error) => {
            let _ = db.exec("ROLLBACK");
            Err(error)
        }
    }
}

fn apply_repair_with_open_tx(
    codex_home: &Path,
    target_provider: &str,
    scan: &SessionScan,
    db: &sqlite_state::SqliteDb,
    applied_changes: &mut Vec<SessionChange>,
    global_state_updated: &mut bool,
) -> Result<(SqliteUpdateResult, usize)> {
    let sqlite_stats = sqlite_state::update_sqlite_provider(db, target_provider, scan)?;
    session_files::apply_session_changes(&scan.changes, applied_changes)?;
    let updated_roots = workspace_roots::sync_workspace_roots(codex_home, &scan.thread_cwd_by_id)?;
    *global_state_updated = updated_roots > 0;
    Ok((sqlite_stats, updated_roots))
}

fn build_result(
    target_provider: String,
    scan: SessionScan,
    sqlite: SqliteUpdateResult,
    updated_workspace_roots: usize,
    backup_dir: Option<PathBuf>,
) -> CodexSessionVisibilityRepairResult {
    CodexSessionVisibilityRepairResult {
        target_provider: target_provider.clone(),
        changed_session_files: scan.changes.len(),
        skipped_locked_session_files: 0,
        sqlite_rows_updated: sqlite.total_rows(),
        sqlite_provider_rows_updated: sqlite.provider_rows,
        sqlite_user_event_rows_updated: sqlite.user_event_rows,
        sqlite_cwd_rows_updated: sqlite.cwd_rows,
        sqlite_present: sqlite.present,
        updated_workspace_roots,
        backup_dir: backup_dir.map(|path| path.display().to_string()),
        encrypted_content_warning: encrypted_content_warning(
            &scan.encrypted_content_by_provider,
            &target_provider,
        ),
    }
}
