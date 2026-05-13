// Prevent a console window from showing in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    readup_lib::run();
}
