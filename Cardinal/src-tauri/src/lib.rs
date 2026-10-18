//! Cardinal desktop shell. The web app does all the drawing; this side stores files and saves exports.
mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = storage::resolve_data_dir(app.handle())?;
            storage::ensure_layout(&dir)?;
            app.manage(storage::DataDir(dir));
            // the window title carries the version, e.g. "Cardinal 0.2.0"
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_title(&format!("Cardinal {}", app.package_info().version));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::store_ping,
            storage::store_list,
            storage::store_get,
            storage::store_put,
            storage::store_del,
            storage::store_usage,
            storage::open_data_folder,
            storage::save_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cardinal");
}
