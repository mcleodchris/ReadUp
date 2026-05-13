use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;
use thiserror::Error;

use crate::{InitKind, InitTarget};

const MD_EXTS: &[&str] = &["md", "markdown"];

#[derive(Debug, Error)]
pub enum FsError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid path")]
    InvalidPath,
}

#[derive(Serialize)]
pub struct FileRead {
    pub path: PathBuf,
    pub content: String,
    /// Modification time in millis since Unix epoch. 0 if unavailable.
    pub mtime: u128,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum TreeNode {
    File { name: String, path: PathBuf },
    Dir {
        name: String,
        path: PathBuf,
        children: Vec<TreeNode>,
    },
}

pub fn is_markdown(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    MD_EXTS.iter().any(|e| lower.ends_with(&format!(".{e}")))
}

fn stem_lower(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    match lower.rfind('.') {
        Some(i) if i > 0 => lower[..i].to_string(),
        _ => lower,
    }
}

/// Pure: choose the entry file for a folder given the list of filenames
/// directly inside it. See plan: index → README → first sorted → None.
pub fn resolve_entry_from_names(names: &[String]) -> Option<String> {
    let md: Vec<&String> = names.iter().filter(|n| is_markdown(n)).collect();
    if md.is_empty() {
        return None;
    }

    if let Some(idx) = md.iter().find(|n| stem_lower(n) == "index") {
        return Some((*idx).clone());
    }
    if let Some(rd) = md.iter().find(|n| stem_lower(n) == "readme") {
        return Some((*rd).clone());
    }

    let mut sorted: Vec<String> = md.into_iter().cloned().collect();
    sorted.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    sorted.into_iter().next()
}

fn read_dir_names(path: &Path) -> Result<Vec<String>, FsError> {
    let mut names = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if entry.file_type()?.is_file() {
            if let Some(n) = entry.file_name().to_str() {
                names.push(n.to_string());
            }
        }
    }
    Ok(names)
}

pub fn resolve_entry_path(folder: &Path) -> Result<Option<PathBuf>, FsError> {
    let names = read_dir_names(folder)?;
    Ok(resolve_entry_from_names(&names).map(|n| folder.join(n)))
}

/// Recursively build a markdown-only tree, pruning empty directories and
/// non-markdown files. Sort: directories first, then files, each by name.
pub fn build_tree(root: &Path) -> Result<Option<TreeNode>, FsError> {
    let meta = fs::metadata(root)?;
    if !meta.is_dir() {
        return Err(FsError::InvalidPath);
    }
    let name = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    Ok(build_node(root, &name))
}

fn build_node(path: &Path, name: &str) -> Option<TreeNode> {
    let read = match fs::read_dir(path) {
        Ok(r) => r,
        Err(_) => return None,
    };

    let mut children: Vec<TreeNode> = Vec::new();
    for entry in read.flatten() {
        let entry_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().to_string();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            if let Some(child) = build_node(&entry_path, &entry_name) {
                children.push(child);
            }
        } else if file_type.is_file() && is_markdown(&entry_name) {
            children.push(TreeNode::File {
                name: entry_name,
                path: entry_path,
            });
        }
    }

    if children.is_empty() {
        return None;
    }

    children.sort_by(|a, b| compare_nodes(a, b));

    Some(TreeNode::Dir {
        name: name.to_string(),
        path: path.to_path_buf(),
        children,
    })
}

fn compare_nodes(a: &TreeNode, b: &TreeNode) -> Ordering {
    let dir_a = matches!(a, TreeNode::Dir { .. });
    let dir_b = matches!(b, TreeNode::Dir { .. });
    if dir_a != dir_b {
        return if dir_a { Ordering::Less } else { Ordering::Greater };
    }
    let na = node_name(a).to_lowercase();
    let nb = node_name(b).to_lowercase();
    na.cmp(&nb)
}

fn node_name(n: &TreeNode) -> &str {
    match n {
        TreeNode::File { name, .. } | TreeNode::Dir { name, .. } => name,
    }
}

pub fn cli_open(arg: &str) -> Option<InitTarget> {
    let path = PathBuf::from(arg);
    let meta = fs::metadata(&path).ok()?;
    let kind = if meta.is_dir() {
        InitKind::Folder
    } else {
        InitKind::File
    };
    Some(InitTarget {
        kind,
        path: path.canonicalize().unwrap_or(path),
    })
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn read_file(path: String) -> Result<FileRead, String> {
    let p = PathBuf::from(&path);
    let content = fs::read_to_string(&p).map_err(|e| format!("read_file: {e}"))?;
    let mtime = fs::metadata(&p)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    Ok(FileRead {
        path: p,
        content,
        mtime,
    })
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<TreeNode, String> {
    let p = PathBuf::from(&path);
    match build_tree(&p).map_err(|e| e.to_string())? {
        Some(t) => Ok(t),
        None => Ok(TreeNode::Dir {
            name: p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string(),
            path: p,
            children: vec![],
        }),
    }
}

#[tauri::command]
pub fn resolve_entry(folder: String) -> Result<Option<String>, String> {
    let p = PathBuf::from(&folder);
    let resolved = resolve_entry_path(&p).map_err(|e| e.to_string())?;
    Ok(resolved.map(|pb| pb.to_string_lossy().to_string()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn is_markdown_matches_extensions() {
        assert!(is_markdown("a.md"));
        assert!(is_markdown("A.MD"));
        assert!(is_markdown("a.markdown"));
        assert!(!is_markdown("a.mdx"));
        assert!(!is_markdown("README"));
    }

    #[test]
    fn resolve_entry_prefers_index() {
        let r = resolve_entry_from_names(&v(["zebra.md", "Index.MD", "README.md"]));
        assert_eq!(r.as_deref(), Some("Index.MD"));
    }

    #[test]
    fn resolve_entry_falls_back_to_readme() {
        let r = resolve_entry_from_names(&v(["zebra.md", "Readme.md", "alpha.md"]));
        assert_eq!(r.as_deref(), Some("Readme.md"));
    }

    #[test]
    fn resolve_entry_falls_back_to_first_sorted() {
        let r = resolve_entry_from_names(&v(["zebra.md", "Banana.md", "apple.md"]));
        assert_eq!(r.as_deref(), Some("apple.md"));
    }

    #[test]
    fn resolve_entry_none_when_no_markdown() {
        assert!(resolve_entry_from_names(&v(["foo.txt"])).is_none());
        assert!(resolve_entry_from_names(&[]).is_none());
    }

    #[test]
    fn build_tree_prunes_and_sorts() {
        let dir = tempdir().unwrap();
        write(&dir.path().join("alpha.md"), "a");
        write(&dir.path().join("zebra.md"), "z");
        write(&dir.path().join("image.png"), "x");

        let sub = dir.path().join("notes");
        fs::create_dir_all(&sub).unwrap();
        write(&sub.join("nested.md"), "n");

        let empty = dir.path().join("empty");
        fs::create_dir_all(&empty).unwrap();
        write(&empty.join("ignored.png"), "x");

        let tree = build_tree(dir.path()).unwrap().unwrap();
        match tree {
            TreeNode::Dir { children, .. } => {
                let names: Vec<String> = children.iter().map(|c| node_name(c).to_string()).collect();
                assert_eq!(names, vec!["notes", "alpha.md", "zebra.md"]);
            }
            _ => panic!("expected dir at root"),
        }
    }

    #[test]
    fn build_tree_empty_returns_none() {
        let dir = tempdir().unwrap();
        write(&dir.path().join("a.png"), "x");
        assert!(build_tree(dir.path()).unwrap().is_none());
    }

    #[test]
    fn resolve_entry_path_uses_directory() {
        let dir = tempdir().unwrap();
        write(&dir.path().join("README.md"), "hi");
        write(&dir.path().join("zebra.md"), "z");
        let entry = resolve_entry_path(dir.path()).unwrap().unwrap();
        assert_eq!(entry.file_name().unwrap(), "README.md");
    }

    fn v<const N: usize>(items: [&str; N]) -> Vec<String> {
        items.into_iter().map(|s| s.to_string()).collect()
    }

    fn write(path: &Path, content: &str) {
        let mut f = File::create(path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }
}
