pub mod fs_commands;

use std::env;
use std::path::PathBuf;

use serde::Serialize;

use fs_commands::{cli_open as cli_open_impl, list_dir, read_file, resolve_entry};

#[derive(Serialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum InitKind {
    File,
    Folder,
}

#[derive(Serialize, Clone)]
pub struct InitTarget {
    pub kind: InitKind,
    pub path: PathBuf,
}

#[tauri::command]
fn cli_open() -> Option<InitTarget> {
    let arg = env::args().nth(1)?;
    cli_open_impl(&arg)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            list_dir,
            resolve_entry,
            cli_open
        ])
        .run(tauri::generate_context!())
        .expect("error while running ReadUp");
}
