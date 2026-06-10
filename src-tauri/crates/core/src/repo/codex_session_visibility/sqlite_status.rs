use std::collections::BTreeMap;
use std::path::Path;

use super::{sqlite_state::SqliteDb, state_db_path, Result, SessionScan, SqliteStatus};

pub(super) fn read_sqlite_status(
    codex_home: &Path,
    target_provider: &str,
    scan: &SessionScan,
) -> Result<SqliteStatus> {
    let db_path = state_db_path(codex_home);
    if !db_path.exists() {
        return Ok(SqliteStatus::default());
    }
    let db = SqliteDb::open(&db_path)?;
    let provider_counts = read_provider_counts(&db)?;
    let rows = provider_counts.values().sum();
    let mismatched_rows = provider_counts
        .iter()
        .filter(|(provider, _)| provider.as_str() != target_provider)
        .map(|(_, count)| *count)
        .sum();
    let columns = db.table_columns("threads")?;
    Ok(SqliteStatus {
        present: true,
        rows,
        mismatched_rows,
        user_event_rows: count_user_event_rows(&db, &columns, scan)?,
        cwd_rows: count_cwd_rows(&db, &columns, scan)?,
        provider_counts,
    })
}

fn read_provider_counts(db: &SqliteDb) -> Result<BTreeMap<String, usize>> {
    let mut stmt = db.prepare(
        "SELECT COALESCE(model_provider, '') AS provider, COUNT(*) \
         FROM threads GROUP BY COALESCE(model_provider, '')",
    )?;
    let mut counts = BTreeMap::new();
    while stmt.step_row()? {
        let provider = stmt
            .column_text(0)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "(missing)".into());
        counts.insert(provider, stmt.column_i64(1).max(0) as usize);
    }
    Ok(counts)
}

fn count_user_event_rows(
    db: &SqliteDb,
    columns: &std::collections::BTreeSet<String>,
    scan: &SessionScan,
) -> Result<usize> {
    if !columns.contains("has_user_event") {
        return Ok(0);
    }
    let mut rows = 0;
    for thread_id in &scan.user_event_thread_ids {
        rows += count_with_params(
            db,
            "SELECT COUNT(*) FROM threads WHERE id = ? AND COALESCE(has_user_event, 0) <> 1",
            &[thread_id],
        )?;
    }
    Ok(rows)
}

fn count_cwd_rows(
    db: &SqliteDb,
    columns: &std::collections::BTreeSet<String>,
    scan: &SessionScan,
) -> Result<usize> {
    if !columns.contains("cwd") {
        return Ok(0);
    }
    let mut rows = 0;
    for (thread_id, cwd) in &scan.thread_cwd_by_id {
        rows += count_with_params(
            db,
            "SELECT COUNT(*) FROM threads WHERE id = ? AND COALESCE(cwd, '') <> ?",
            &[thread_id, cwd],
        )?;
    }
    Ok(rows)
}

fn count_with_params(db: &SqliteDb, sql: &str, params: &[&str]) -> Result<usize> {
    let mut stmt = db.prepare(sql)?;
    for (index, value) in params.iter().enumerate() {
        stmt.bind_text(index as i32 + 1, value)?;
    }
    if stmt.step_row()? {
        Ok(stmt.column_i64(0).max(0) as usize)
    } else {
        Ok(0)
    }
}
