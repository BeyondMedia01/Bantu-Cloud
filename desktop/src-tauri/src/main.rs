#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use std::process::Child;
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

struct SidecarState(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let resource_dir = app.path().resource_dir()
                .map_err(|e| format!("No resource dir: {e}"))?;
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("No app data dir: {e}"))?;
            let template_db = resource_dir.join("template.db");
            let db_path = app_data_dir.join("bantu.db");

            sidecar::ensure_database(&template_db, &db_path)?;

            let child = sidecar::spawn_sidecar(&resource_dir, &db_path)?;

            // Wait for sidecar on a dedicated OS thread (not blocking Tokio async runtime)
            std::thread::spawn(|| {
                if let Err(e) = sidecar::wait_for_sidecar(10_000) {
                    eprintln!("Sidecar wait failed: {e}");
                }
            }).join().map_err(|_| "Thread join failed")?;

            app.manage(SidecarState(Mutex::new(Some(child))));

            // Show the main window after sidecar is ready
            if let Some(window) = app.get_webview_window("main") {
                window.show().ok();
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
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
