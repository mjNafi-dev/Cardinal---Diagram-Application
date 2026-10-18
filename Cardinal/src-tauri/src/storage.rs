//! File storage, same layout as the Node server (server/storage.mjs), so existing projects just show up:
//!   <Documents>/Cardinal/{projects,diagrams,settings}/<id>.json
//! Writes are atomic (tmp + rename). Deleting moves the file to .trash/<collection>/<id>.<time>.json.

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub struct DataDir(pub PathBuf);

const COLLECTIONS: [&str; 3] = ["projects", "diagrams", "settings"];

/// `CARDINAL_DATA` wins (handy for testing); otherwise the real Documents folder, even when it lives in OneDrive.
pub fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Ok(p) = std::env::var("CARDINAL_DATA") {
        if !p.trim().is_empty() {
            return Ok(PathBuf::from(p));
        }
    }
    let docs = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir().map(|h| h.join("Documents")))?;
    Ok(docs.join("Cardinal"))
}

pub fn ensure_layout(dir: &Path) -> std::io::Result<()> {
    for c in COLLECTIONS {
        fs::create_dir_all(dir.join(c))?;
    }
    Ok(())
}

fn check_collection(col: &str) -> Result<(), String> {
    if COLLECTIONS.contains(&col) {
        Ok(())
    } else {
        Err("Unknown collection".into())
    }
}

fn check_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if ok {
        Ok(())
    } else {
        Err("Bad id".into())
    }
}

fn file_of(dir: &DataDir, col: &str, id: &str) -> Result<PathBuf, String> {
    check_collection(col)?;
    check_id(id)?;
    Ok(dir.0.join(col).join(format!("{id}.json")))
}

#[derive(Serialize)]
pub struct Ping {
    ok: bool,
    #[serde(rename = "dataDir")]
    data_dir: String,
}

#[tauri::command]
pub fn store_ping(dir: State<DataDir>) -> Ping {
    Ping { ok: true, data_dir: dir.0.to_string_lossy().into_owned() }
}

#[derive(Serialize)]
pub struct Entry {
    id: String,
    meta: Value,
}

/// Every document in a collection as { id, meta } (meta = file.meta, or the whole file if it has none).
#[tauri::command]
pub fn store_list(dir: State<DataDir>, col: String) -> Result<Vec<Entry>, String> {
    check_collection(&col)?;
    let mut out = Vec::new();
    let rd = fs::read_dir(dir.0.join(&col)).map_err(|e| e.to_string())?;
    for ent in rd.flatten() {
        let name = ent.file_name().to_string_lossy().into_owned();
        let Some(id) = name.strip_suffix(".json") else { continue };
        let Ok(text) = fs::read_to_string(ent.path()) else { continue };
        let Ok(mut data) = serde_json::from_str::<Value>(&text) else { continue };
        let meta = match data.get_mut("meta") {
            Some(m) => m.take(),
            None => data,
        };
        out.push(Entry { id: id.to_string(), meta });
    }
    Ok(out)
}

/// The raw JSON text of one document, or null when it doesn't exist.
#[tauri::command]
pub fn store_get(dir: State<DataDir>, col: String, id: String) -> Result<Option<String>, String> {
    let f = file_of(&dir, &col, &id)?;
    if !f.exists() {
        return Ok(None);
    }
    fs::read_to_string(f).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn store_put(dir: State<DataDir>, col: String, id: String, body: String) -> Result<(), String> {
    let f = file_of(&dir, &col, &id)?;
    serde_json::from_str::<Value>(&body).map_err(|e| format!("Not valid JSON: {e}"))?; // validate before touching the disk
    let tmp = f.with_extension("json.tmp");
    fs::write(&tmp, body).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &f).map_err(|e| e.to_string())
}

/// Never hard-deletes: the file goes to .trash.
#[tauri::command]
pub fn store_del(dir: State<DataDir>, col: String, id: String) -> Result<(), String> {
    let f = file_of(&dir, &col, &id)?;
    if f.exists() {
        let trash = dir.0.join(".trash").join(&col);
        fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
        let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        fs::rename(&f, trash.join(format!("{id}.{ms}.json"))).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Usage {
    bytes: u64,
    #[serde(rename = "trashBytes")]
    trash_bytes: u64,
}

fn dir_size(p: &Path) -> u64 {
    let Ok(rd) = fs::read_dir(p) else { return 0 };
    rd.flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// How much disk space the data folder takes, and how much of that is in .trash.
#[tauri::command]
pub fn store_usage(dir: State<DataDir>) -> Usage {
    Usage { bytes: dir_size(&dir.0), trash_bytes: dir_size(&dir.0.join(".trash")) }
}

#[tauri::command]
pub fn open_data_folder(dir: State<DataDir>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let prog = "explorer";
    #[cfg(target_os = "macos")]
    let prog = "open";
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let prog = "xdg-open";
    std::process::Command::new(prog).arg(&dir.0).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Exports: shows a native "Save as" dialog and writes the bytes sent as the raw request body.
/// The suggested file name comes in the `x-file-name` header (URI-encoded).
/// Returns the name of the file actually written, or null if the dialog was cancelled.
#[tauri::command]
pub async fn save_file(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected file bytes".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(decode_uri)
        .unwrap_or_else(|| "export".into());
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some(ext) = Path::new(&name).extension().and_then(|e| e.to_str()) {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
    }
    let Some(target) = dialog.blocking_save_file() else { return Ok(None) };
    let path = target.into_path().map_err(|e| e.to_string())?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(name)))
}

/// Percent-decoding for the file name header (the web side sends encodeURIComponent(name)).
fn decode_uri(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
