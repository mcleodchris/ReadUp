pub mod fs_commands;
pub mod roots;

use std::env;
use std::path::PathBuf;

use serde::Serialize;

use fs_commands::{
    cli_open as cli_open_impl, list_dir, open_file, open_folder, read_file, resolve_entry,
};
use roots::OpenedRoots;

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

/// Return the first non-flag CLI argument, if any.
///
/// `tauri dev` may pass through its own flags via the runner; we treat anything
/// starting with `-` as not-our-arg so a stray `--debug` doesn't get
/// interpreted as a file path.
fn first_positional_arg() -> Option<String> {
    env::args()
        .skip(1)
        .find(|a| !a.is_empty() && !a.starts_with('-'))
}

#[tauri::command]
fn cli_open() -> Option<InitTarget> {
    let arg = first_positional_arg()?;
    cli_open_impl(&arg)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenedRoots::default())
        .invoke_handler(tauri::generate_handler![
            open_folder,
            open_file,
            read_file,
            list_dir,
            resolve_entry,
            cli_open
        ])
        .run(tauri::generate_context!())
        .expect("error while running ReadUp");
}
