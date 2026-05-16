use std::env;
use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tracing_subscriber::fmt::MakeWriter;

pub const LOG_FILE_ENV: &str = "AQBOT_LOG_FILE";

#[derive(Clone)]
struct SharedLogFile {
    file: Arc<Mutex<File>>,
}

struct SharedLogFileWriter {
    file: Arc<Mutex<File>>,
}

impl SharedLogFile {
    fn new(file: File) -> Self {
        Self {
            file: Arc::new(Mutex::new(file)),
        }
    }
}

impl Write for SharedLogFileWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut file = self
            .file
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "log file lock poisoned"))?;
        file.write(buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut file = self
            .file
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "log file lock poisoned"))?;
        file.flush()
    }
}

impl<'writer> MakeWriter<'writer> for SharedLogFile {
    type Writer = SharedLogFileWriter;

    fn make_writer(&'writer self) -> Self::Writer {
        SharedLogFileWriter {
            file: Arc::clone(&self.file),
        }
    }
}

pub fn init_tracing() {
    let log_path = log_file_path_from_value(env::var_os(LOG_FILE_ENV));

    if let Some(path) = log_path {
        match open_log_file(&path) {
            Ok(file) => {
                if let Err(err) = tracing_subscriber::fmt()
                    .with_env_filter(env_filter())
                    .with_writer(SharedLogFile::new(file))
                    .try_init()
                {
                    eprintln!("failed to initialize AQBot file logging: {err}");
                    return;
                }
                tracing::info!(
                    log_file = %path.display(),
                    "AQBot diagnostic file logging enabled"
                );
                return;
            }
            Err(err) => {
                eprintln!(
                    "failed to open AQBot diagnostic log file '{}': {err}",
                    path.display()
                );
                init_stderr_tracing();
                tracing::warn!(
                    log_file = %path.display(),
                    error = %err,
                    "Falling back to stderr logging because diagnostic log file could not be opened"
                );
                return;
            }
        }
    }

    init_stderr_tracing();
}

pub fn log_process_startup() {
    tracing::info!(
        package_name = env!("CARGO_PKG_NAME"),
        crate_version = env!("CARGO_PKG_VERSION"),
        os = env::consts::OS,
        arch = env::consts::ARCH,
        rust_log = %env_value("RUST_LOG"),
        aqbot_log_file = %env_value(LOG_FILE_ENV),
        xdg_session_type = %env_value("XDG_SESSION_TYPE"),
        wayland_display = %env_value("WAYLAND_DISPLAY"),
        display = %env_value("DISPLAY"),
        gdk_backend = %env_value("GDK_BACKEND"),
        "AQBot process startup diagnostics"
    );
}

fn init_stderr_tracing() {
    if let Err(err) = tracing_subscriber::fmt()
        .with_env_filter(env_filter())
        .try_init()
    {
        eprintln!("failed to initialize AQBot stderr logging: {err}");
    }
}

fn env_filter() -> tracing_subscriber::EnvFilter {
    tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
}

fn env_value(key: &str) -> String {
    env::var(key).unwrap_or_else(|_| "<unset>".to_string())
}

fn log_file_path_from_value(value: Option<OsString>) -> Option<PathBuf> {
    let value = value?;
    if value.to_string_lossy().trim().is_empty() {
        return None;
    }
    Some(PathBuf::from(value))
}

fn open_log_file(path: &Path) -> io::Result<File> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    OpenOptions::new().create(true).append(true).open(path)
}

#[cfg(test)]
mod tests {
    use super::{log_file_path_from_value, open_log_file};
    use std::ffi::OsString;
    use std::io::Write;

    #[test]
    fn ignores_missing_or_blank_log_file_env() {
        assert_eq!(log_file_path_from_value(None), None);
        assert_eq!(log_file_path_from_value(Some(OsString::from("   "))), None);
    }

    #[test]
    fn keeps_non_blank_log_file_path() {
        assert_eq!(
            log_file_path_from_value(Some(OsString::from("/tmp/aqbot.log"))),
            Some(std::path::PathBuf::from("/tmp/aqbot.log"))
        );
    }

    #[test]
    fn opens_log_file_and_creates_parent_directories() {
        let temp_dir = tempfile::tempdir().expect("tempdir");
        let log_path = temp_dir.path().join("nested").join("aqbot.log");

        {
            let mut file = open_log_file(&log_path).expect("open log file");
            writeln!(file, "first").expect("write first log line");
        }
        {
            let mut file = open_log_file(&log_path).expect("reopen log file");
            writeln!(file, "second").expect("write second log line");
        }

        let contents = std::fs::read_to_string(log_path).expect("read log file");
        assert!(contents.contains("first"));
        assert!(contents.contains("second"));
    }
}
