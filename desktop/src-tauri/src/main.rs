#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sidecar;
mod tray;

use std::fs;
use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;

struct SidecarState(Mutex<Option<CommandChild>>);

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_license_token,
            commands::store_license_token,
            commands::clear_license_token,
        ])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("bantu"));

            // Write a startup log so we can debug if something fails
            let log_path = if !app_data_dir.as_os_str().is_empty() {
                let p = app_data_dir.join("startup.log");
                let _ = fs::create_dir_all(&app_data_dir);
                let _ = fs::write(&p, format!("startup at {}\n", chrono_now()));
                Some(p)
            } else {
                None
            };

            macro_rules! log_err {
                ($label:expr, $e:expr) => {
                    let msg = format!("{}: {}\n", $label, $e);
                    eprint!("{}", msg);
                    if let Some(ref p) = log_path {
                        let _ = fs::write(p, fs::read_to_string(p).unwrap_or_default() + &msg);
                    }
                };
            }

            // Resource dir — non-fatal
            let resource_dir = match app.path().resource_dir() {
                Ok(d) => d,
                Err(e) => {
                    log_err!("resource_dir", e);
                    app_data_dir.clone()
                }
            };

            // template.db — non-fatal
            let template_db = resource_dir.join("template.db");
            let db_path = app_data_dir.join("bantu.db");
            if let Err(e) = sidecar::ensure_database(&template_db, &db_path) {
                log_err!("ensure_database", e);
            }

            // Sidecar — non-fatal
            match sidecar::spawn_sidecar(&app_handle, &db_path) {
                Ok(child) => {
                    app.manage(SidecarState(Mutex::new(Some(child))));
                }
                Err(e) => {
                    log_err!("spawn_sidecar", e);
                }
            }

            // Tray — non-fatal
            if let Err(e) = tray::setup_tray(app.handle()) {
                log_err!("setup_tray", e);
            }

            // Wait for sidecar then show window
            std::thread::spawn(move || {
                if let Err(e) = sidecar::wait_for_sidecar(10_000) {
                    let msg = format!("wait_for_sidecar: {e}\n");
                    eprint!("{}", msg);
                    if let Some(ref p) = log_path {
                        let _ = fs::write(p, fs::read_to_string(p).unwrap_or_default() + &msg);
                    }
                }
                if let Some(window) = app_handle.get_webview_window("main") {
                    window.show().ok();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            child.kill().ok();
                        }
                    }
                }
            }
        });
}

/// Minimal timestamp without pulling in chrono
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = d.as_secs();
    let ms = d.subsec_millis();
    // days since epoch
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let h = time_secs / 3600;
    let m = (time_secs % 3600) / 60;
    let s = time_secs % 60;
    format!("day={days} {h:02}:{m:02}:{s:02}.{ms:03}")
}
