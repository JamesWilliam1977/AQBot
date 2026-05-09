use crate::{window_state, AppState};
use std::sync::atomic::Ordering;
use tauri::{LogicalPosition, LogicalSize, Manager, Position, Size, WebviewWindow};

const MAIN_WINDOW_LABEL: &str = "main";

pub fn configure_main_window(app: &tauri::AppHandle, main_window: &WebviewWindow) {
    // On Windows, hide native decorations so the custom TitleBar is
    // the only title bar. macOS keeps its Overlay style (traffic lights).
    // After removing decorations, re-enable minimize/maximize capabilities
    // since set_decorations(false) strips the WS_MINIMIZEBOX/WS_MAXIMIZEBOX styles.
    #[cfg(target_os = "windows")]
    {
        let _ = main_window.set_decorations(false);
        let _ = main_window.set_minimizable(true);
        let _ = main_window.set_maximizable(true);
    }

    let state = app.state::<AppState>();
    if let Some(saved_state) = window_state::load_window_state(&state.app_data_dir) {
        let restored_state = if let Ok(Some(monitor)) = main_window.current_monitor() {
            let monitor_size = monitor
                .size()
                .to_logical::<f64>(main_window.scale_factor().unwrap_or(1.0));
            window_state::clamp_window_state_to_monitor(
                saved_state,
                monitor_size.width,
                monitor_size.height,
            )
        } else {
            saved_state
        };

        let _ = main_window.set_size(Size::Logical(LogicalSize::new(
            restored_state.width,
            restored_state.height,
        )));

        if let (Some(x), Some(y)) = (restored_state.x, restored_state.y) {
            let _ = main_window.set_position(Position::Logical(LogicalPosition::new(x, y)));
        } else {
            let _ = main_window.center();
        }

        if restored_state.fullscreen {
            let _ = main_window.set_fullscreen(true);
        } else if restored_state.maximized {
            let _ = main_window.maximize();
        }
    }
}

pub fn release_main_window_to_tray(window: &tauri::Window) -> Result<(), String> {
    let app = window.app_handle();
    if should_release_webview(&app) {
        mark_main_window_released(&app, true);
        if let Err(err) = window.destroy() {
            mark_main_window_released(&app, false);
            return Err(err.to_string());
        }
        Ok(())
    } else {
        window.hide().map_err(|err| err.to_string())
    }
}

pub fn release_webview_window_to_tray(window: &WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    if should_release_webview(&app) {
        mark_main_window_released(&app, true);
        if let Err(err) = window.destroy() {
            mark_main_window_released(&app, false);
            return Err(err.to_string());
        }
        Ok(())
    } else {
        window.hide().map_err(|err| err.to_string())
    }
}

pub fn minimize_main_window(window: tauri::Window) -> Result<(), String> {
    let app = window.app_handle();
    if should_release_webview(&app) {
        release_main_window_to_tray(&window)
    } else {
        window.minimize().map_err(|err| err.to_string())
    }
}

pub fn restore_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let state = app.state::<AppState>();
        state
            .main_window_released_to_tray
            .store(false, Ordering::Relaxed);
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let state = app.state::<AppState>();
    if state.main_window_restoring.swap(true, Ordering::Relaxed) {
        return;
    }

    let app = app.clone();
    std::thread::spawn(move || {
        let result = restore_main_window_inner(&app);
        let state = app.state::<AppState>();
        if result.is_ok() {
            state
                .main_window_released_to_tray
                .store(false, Ordering::Relaxed);
        } else if let Err(err) = result {
            tracing::warn!("Failed to restore main window: {}", err);
        }
        state.main_window_restoring.store(false, Ordering::Relaxed);
    });
}

fn restore_main_window_inner(app: &tauri::AppHandle) -> Result<(), String> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window config not found".to_string())?;

    let window = tauri::WebviewWindowBuilder::from_config(app, config)
        .map_err(|err| err.to_string())?
        .build()
        .map_err(|err| err.to_string())?;
    configure_main_window(app, &window);
    Ok(())
}

fn should_release_webview(app: &tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    should_release_webview_for_settings(
        state.close_to_tray.load(Ordering::Relaxed),
        state.release_webview_on_tray.load(Ordering::Relaxed),
    )
}

pub(crate) fn should_release_webview_for_settings(
    close_to_tray: bool,
    release_webview_on_tray: bool,
) -> bool {
    close_to_tray && release_webview_on_tray
}

fn mark_main_window_released(app: &tauri::AppHandle, released: bool) {
    let state = app.state::<AppState>();
    state
        .main_window_released_to_tray
        .store(released, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::should_release_webview_for_settings;

    #[test]
    fn releases_webview_only_when_close_to_tray_and_release_setting_are_enabled() {
        assert!(should_release_webview_for_settings(true, true));
        assert!(!should_release_webview_for_settings(true, false));
        assert!(!should_release_webview_for_settings(false, true));
        assert!(!should_release_webview_for_settings(false, false));
    }
}
