use std::fs;
use tauri::Manager;

fn token_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("license.tok"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_license_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = token_path(&app)?;
    if path.exists() {
        let token = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let token = token.trim().to_string();
        if token.is_empty() {
            Ok(None)
        } else {
            Ok(Some(token))
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn store_license_token(app: tauri::AppHandle, token: String) -> Result<(), String> {
    let path = token_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, token).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_license_token(app: tauri::AppHandle) -> Result<(), String> {
    let path = token_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
