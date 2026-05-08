use std::fs;
use std::net::TcpStream;
use std::path::Path;
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

const SIDECAR_PORT: u16 = 5005;

/// Copies the pre-migrated template.db to db_path if db_path doesn't already exist.
pub fn ensure_database(template_db: &Path, db_path: &Path) -> Result<(), String> {
    if db_path.exists() {
        return Ok(());
    }
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(template_db, db_path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Spawns the Express backend sidecar using Tauri's shell plugin (correct path resolution).
pub fn spawn_sidecar(app: &AppHandle, db_path: &Path) -> Result<CommandChild, String> {
    let db_url = format!("file:{}", db_path.to_string_lossy().replace('\\', "/"));

    let (_rx, child) = app
        .shell()
        .sidecar("backend")
        .map_err(|e| format!("Sidecar binary not found: {e}"))?
        .env("NODE_ENV", "production")
        .env("APP_MODE", "desktop")
        .env("PORT", SIDECAR_PORT.to_string())
        .env("DATABASE_URL", &db_url)
        .env("AUTH_SKIP_VERIFY", "true")
        .env("JWT_SECRET", "desktop-dummy-secret")
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

    Ok(child)
}

/// Waits for the sidecar HTTP server to be ready by polling TCP port 5005.
pub fn wait_for_sidecar(timeout_ms: u64) -> Result<(), String> {
    let addr = format!("127.0.0.1:{}", SIDECAR_PORT);
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    std::thread::sleep(Duration::from_millis(300));
    loop {
        if TcpStream::connect(addr.as_str()).is_ok() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("Sidecar did not start within {}ms", timeout_ms));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}
