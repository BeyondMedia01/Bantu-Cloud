#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sidecar;
mod tray;

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
            let resource_dir = app.path().resource_dir()
                .map_err(|e| format!("No resource dir: {e}"))?;
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("No app data dir: {e}"))?;
            let template_db = resource_dir.join("template.db");
            let db_path = app_data_dir.join("bantu.db");

            sidecar::ensure_database(&template_db, &db_path)?;

            match sidecar::spawn_sidecar(app.handle(), &db_path) {
                Ok(child) => {
                    app.manage(SidecarState(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("Sidecar warning (non-fatal): {e}");
                }
            }

            tray::setup_tray(app.handle())?;

            // Wait for sidecar and show window on a dedicated OS thread
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Err(e) = sidecar::wait_for_sidecar(10_000) {
                    eprintln!("Sidecar wait failed: {e}");
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
