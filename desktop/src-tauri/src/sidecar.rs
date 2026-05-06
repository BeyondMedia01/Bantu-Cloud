use std::fs;
use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command};
use std::time::{Duration, Instant};

/// Copies the pre-migrated template.db to db_path if db_path doesn't already exist.
/// template_db is the path to resources/template.db bundled with the installer.
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

/// Spawns the Express backend sidecar.
/// - resource_dir: path to the Tauri resource directory (contains the Node sidecar binary)
/// - db_path: absolute path to the SQLite database file
/// Returns the Child process handle.
pub fn spawn_sidecar(resource_dir: &Path, db_path: &Path) -> Result<Child, String> {
    // The sidecar binary is named "backend" (or "backend.exe" on Windows).
    // Tauri bundles it as a sidecar in the resources directory.
    let sidecar_path = if cfg!(target_os = "windows") {
        resource_dir.join("backend.exe")
    } else {
        resource_dir.join("backend")
    };

    let db_url = format!("file:{}", db_path.display());

    Command::new(&sidecar_path)
        .env("NODE_ENV", "production")
        .env("APP_MODE", "desktop")
        .env("PORT", "5005")
        .env("DATABASE_URL", &db_url)
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar at {:?}: {}", sidecar_path, e))
}

/// Waits for the sidecar HTTP server to be ready by polling TCP port 5005.
/// Runs on a dedicated OS thread (NOT using reqwest::blocking which panics in Tokio).
/// timeout_ms: maximum milliseconds to wait before giving up.
pub fn wait_for_sidecar(timeout_ms: u64) -> Result<(), String> {
    let addr = "127.0.0.1:5005";
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    loop {
        if TcpStream::connect(addr).is_ok() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("Sidecar did not start within {}ms", timeout_ms));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}
