#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sidecar;
mod tray;

use std::process::Child;
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

struct SidecarState(Mutex<Option<Child>>);

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

            let child = sidecar::spawn_sidecar(&resource_dir, &db_path)?;

            app.manage(SidecarState(Mutex::new(Some(child))));

            tray::setup_tray(app.handle())?;

            // Wait for sidecar and show window on a dedicated OS thread so setup returns immediately
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
                        if let Some(mut child) = guard.take() {
                            child.kill().ok();
                        }
                    }
                }
            }
        });
}
