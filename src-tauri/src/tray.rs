use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

const TRAY_ID: &str = "aqbot-tray";

fn tray_labels(language: &str) -> (&'static str, &'static str) {
    let lang = language.to_ascii_lowercase();
    if lang == "en" || lang.starts_with("en-") {
        ("Show", "Quit")
    } else if lang == "zh-tw" {
        ("顯示主視窗", "退出 AQBot")
    } else if lang == "ja" {
        ("メインウィンドウを表示", "AQBot を終了")
    } else if lang == "ko" {
        ("메인 창 표시", "AQBot 종료")
    } else if lang == "fr" {
        ("Afficher", "Quitter AQBot")
    } else if lang == "de" {
        ("Anzeigen", "AQBot beenden")
    } else if lang == "es" {
        ("Mostrar", "Salir de AQBot")
    } else if lang == "ru" {
        ("Показать", "Выйти из AQBot")
    } else if lang == "hi" {
        ("दिखाएं", "AQBot छोड़ें")
    } else if lang == "ar" {
        ("عرض", "إنهاء AQBot")
    } else {
        ("显示主窗口", "退出 AQBot")
    }
}

fn build_menu(
    app: &AppHandle,
    language: &str,
) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let (show_label, quit_label) = tray_labels(language);
    let show = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    Ok(menu)
}

pub fn create_tray(app: &AppHandle, language: &str) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_menu(app, language)?;
    let icon = Image::from_path("icons/icon.png").unwrap_or_else(|_| {
        Image::from_bytes(include_bytes!("../icons/32x32.png"))
            .expect("failed to load fallback tray icon")
    });

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("AQBot")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                crate::window_lifecycle::restore_main_window(app);
            }
            "quit" => {
                let state = app.state::<crate::AppState>();
                state
                    .is_quitting
                    .store(true, std::sync::atomic::Ordering::Relaxed);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = crate::window_lifecycle::release_webview_window_to_tray(&w);
                    } else {
                        crate::window_lifecycle::restore_main_window(app);
                    }
                } else {
                    crate::window_lifecycle::restore_main_window(app);
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn sync_tray_language(
    app: &AppHandle,
    language: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_menu(app, language)?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))?;
    } else {
        create_tray(app, language)?;
    }
    Ok(())
}
