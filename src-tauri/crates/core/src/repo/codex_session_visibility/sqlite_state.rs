use std::collections::BTreeSet;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::path::Path;
use std::ptr;

use libsqlite3_sys as sqlite;

use super::{state_db_path, AQBotError, Result, SessionScan, SqliteUpdateResult};

pub(super) fn assert_sqlite_writable(codex_home: &Path) -> Result<()> {
    let db_path = state_db_path(codex_home);
    if !db_path.exists() {
        return Ok(());
    }
    let db = SqliteDb::open(&db_path)?;
    db.exec("BEGIN IMMEDIATE")?;
    db.exec("ROLLBACK")
}

pub(super) fn update_sqlite_provider(
    db: &SqliteDb,
    target_provider: &str,
    scan: &SessionScan,
) -> Result<SqliteUpdateResult> {
    let columns = db.table_columns("threads")?;
    let provider_rows = db.execute_with_params(
        "UPDATE threads SET model_provider = ? WHERE COALESCE(model_provider, '') <> ?",
        &[target_provider, target_provider],
    )?;
    let user_event_rows = update_user_event_rows(db, &columns, scan)?;
    let cwd_rows = update_cwd_rows(db, &columns, scan)?;
    Ok(SqliteUpdateResult {
        present: true,
        provider_rows,
        user_event_rows,
        cwd_rows,
    })
}

fn update_user_event_rows(
    db: &SqliteDb,
    columns: &BTreeSet<String>,
    scan: &SessionScan,
) -> Result<usize> {
    if !columns.contains("has_user_event") {
        return Ok(0);
    }
    let mut rows = 0;
    for thread_id in &scan.user_event_thread_ids {
        rows += db.execute_with_params(
            "UPDATE threads SET has_user_event = 1 WHERE id = ? AND COALESCE(has_user_event, 0) <> 1",
            &[thread_id],
        )?;
    }
    Ok(rows)
}

fn update_cwd_rows(db: &SqliteDb, columns: &BTreeSet<String>, scan: &SessionScan) -> Result<usize> {
    if !columns.contains("cwd") {
        return Ok(0);
    }
    let mut rows = 0;
    for (thread_id, cwd) in &scan.thread_cwd_by_id {
        rows += db.execute_with_params(
            "UPDATE threads SET cwd = ? WHERE id = ? AND COALESCE(cwd, '') <> ?",
            &[cwd, thread_id, cwd],
        )?;
    }
    Ok(rows)
}

pub(super) struct SqliteDb {
    conn: *mut sqlite::sqlite3,
}

impl SqliteDb {
    pub(super) fn open(path: &Path) -> Result<Self> {
        let path = CString::new(path.to_string_lossy().as_bytes())
            .map_err(|_| AQBotError::Gateway("Invalid state_5.sqlite path".into()))?;
        let mut conn = ptr::null_mut();
        let flags = sqlite::SQLITE_OPEN_READWRITE | sqlite::SQLITE_OPEN_URI;
        let rc = unsafe { sqlite::sqlite3_open_v2(path.as_ptr(), &mut conn, flags, ptr::null()) };
        if rc == sqlite::SQLITE_OK {
            return Ok(Self { conn });
        }
        let error = sqlite_error(conn, "open state_5.sqlite");
        if !conn.is_null() {
            unsafe { sqlite::sqlite3_close(conn) };
        }
        Err(error)
    }

    pub(super) fn exec(&self, sql: &str) -> Result<()> {
        let sql = CString::new(sql).map_err(|_| AQBotError::Gateway("Invalid SQL".into()))?;
        let mut error: *mut c_char = ptr::null_mut();
        let rc = unsafe {
            sqlite::sqlite3_exec(self.conn, sql.as_ptr(), None, ptr::null_mut(), &mut error)
        };
        if rc == sqlite::SQLITE_OK {
            return Ok(());
        }
        Err(AQBotError::Gateway(format!(
            "state_5.sqlite: {}",
            sqlite_exec_error(self.conn, error)
        )))
    }

    pub(super) fn table_columns(&self, table: &str) -> Result<BTreeSet<String>> {
        let sql = format!("PRAGMA table_info({})", quote_sql_identifier(table));
        let mut stmt = self.prepare(&sql)?;
        let mut columns = BTreeSet::new();
        while stmt.step_row()? {
            if let Some(name) = stmt.column_text(1) {
                columns.insert(name);
            }
        }
        Ok(columns)
    }

    fn execute_with_params(&self, sql: &str, params: &[&str]) -> Result<usize> {
        let mut stmt = self.prepare(sql)?;
        for (index, value) in params.iter().enumerate() {
            stmt.bind_text(index as c_int + 1, value)?;
        }
        stmt.step_done()?;
        Ok(unsafe { sqlite::sqlite3_changes(self.conn) as usize })
    }

    pub(super) fn prepare(&self, sql: &str) -> Result<SqliteStatement<'_>> {
        let sql = CString::new(sql).map_err(|_| AQBotError::Gateway("Invalid SQL".into()))?;
        let mut stmt = ptr::null_mut();
        let rc = unsafe {
            sqlite::sqlite3_prepare_v2(self.conn, sql.as_ptr(), -1, &mut stmt, ptr::null_mut())
        };
        if rc == sqlite::SQLITE_OK {
            Ok(SqliteStatement { db: self, stmt })
        } else {
            Err(sqlite_error(self.conn, "prepare state_5.sqlite statement"))
        }
    }
}

impl Drop for SqliteDb {
    fn drop(&mut self) {
        if !self.conn.is_null() {
            unsafe { sqlite::sqlite3_close(self.conn) };
        }
    }
}

pub(super) struct SqliteStatement<'a> {
    db: &'a SqliteDb,
    stmt: *mut sqlite::sqlite3_stmt,
}

impl SqliteStatement<'_> {
    pub(super) fn bind_text(&mut self, index: c_int, value: &str) -> Result<()> {
        let value = CString::new(value)
            .map_err(|_| AQBotError::Gateway("Invalid SQLite bind value".into()))?;
        let rc = unsafe {
            sqlite::sqlite3_bind_text(
                self.stmt,
                index,
                value.as_ptr(),
                -1,
                sqlite::SQLITE_TRANSIENT(),
            )
        };
        if rc == sqlite::SQLITE_OK {
            Ok(())
        } else {
            Err(sqlite_error(self.db.conn, "bind state_5.sqlite parameter"))
        }
    }

    fn step_done(&mut self) -> Result<()> {
        match unsafe { sqlite::sqlite3_step(self.stmt) } {
            sqlite::SQLITE_DONE => Ok(()),
            _ => Err(sqlite_error(
                self.db.conn,
                "execute state_5.sqlite statement",
            )),
        }
    }

    pub(super) fn step_row(&mut self) -> Result<bool> {
        match unsafe { sqlite::sqlite3_step(self.stmt) } {
            sqlite::SQLITE_ROW => Ok(true),
            sqlite::SQLITE_DONE => Ok(false),
            _ => Err(sqlite_error(self.db.conn, "query state_5.sqlite")),
        }
    }

    pub(super) fn column_text(&self, index: c_int) -> Option<String> {
        let text = unsafe { sqlite::sqlite3_column_text(self.stmt, index) };
        if text.is_null() {
            return None;
        }
        let cstr = unsafe { CStr::from_ptr(text as *const c_char) };
        Some(cstr.to_string_lossy().to_string())
    }

    pub(super) fn column_i64(&self, index: c_int) -> i64 {
        unsafe { sqlite::sqlite3_column_int64(self.stmt, index) }
    }
}

impl Drop for SqliteStatement<'_> {
    fn drop(&mut self) {
        if !self.stmt.is_null() {
            unsafe { sqlite::sqlite3_finalize(self.stmt) };
        }
    }
}

fn quote_sql_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn sqlite_error(conn: *mut sqlite::sqlite3, action: &str) -> AQBotError {
    let message = if conn.is_null() {
        "unknown SQLite error".into()
    } else {
        let ptr = unsafe { sqlite::sqlite3_errmsg(conn) };
        unsafe { CStr::from_ptr(ptr).to_string_lossy().to_string() }
    };
    AQBotError::Gateway(format!("Failed to {}: {}", action, message))
}

fn sqlite_exec_error(conn: *mut sqlite::sqlite3, error: *mut c_char) -> String {
    if error.is_null() {
        return match sqlite_error(conn, "execute") {
            AQBotError::Gateway(message) => message,
            other => other.to_string(),
        };
    }
    let message = unsafe { CStr::from_ptr(error).to_string_lossy().to_string() };
    unsafe { sqlite::sqlite3_free(error as *mut _) };
    message
}
