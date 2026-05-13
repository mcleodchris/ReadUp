use std::cmp::Ordering;
use std::fs;
use std::io::{ErrorKind, Read};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use thiserror::Error;

use crate::roots::{OpenedRoots, MAX_FILE_BYTES};
use crate::{InitKind, InitTarget};

const MD_EXTS: &[&str] = &["md", "markdown"];

/// IPC error type. The frontend receives `{ kind, message }` so it can
/// distinguish e.g. NotFound vs Forbidden without parsing strings.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum FsError {
    #[error("io error: {message}")]
    Io { message: String },
    #[error("not found: {path}")]
    NotFound { path: String },
    #[error("permission denied: {path}")]
    PermissionDenied { path: String },
    #[error("invalid path: {message}")]
    InvalidPath { message: String },
    #[error("path is outside an opened folder: {path}")]
    Forbidden { path: String },
    #[error("file too large ({size} bytes; max {max})")]
    TooLarge { size: u64, max: u64 },
}

impl From<std::io::Error> for FsError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            ErrorKind::NotFound => FsError::NotFound {
                path: e.to_string(),
            },
            ErrorKind::PermissionDenied => FsError::PermissionDenied {
                path: e.to_string(),
            },
            _ => FsError::Io {
                message: e.to_string(),
            },
        }
    }
}

#[derive(Debug, Serialize)]
pub struct FileRead {
    pub path: PathBuf,
    pub content: String,
    /// Modification time in millis since Unix epoch. 0 if unavailable.
    pub mtime: u128,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum TreeNode {
    File {
        name: String,
        path: PathBuf,
    },
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
        return Err(FsError::InvalidPath {
            message: format!("{} is not a directory", root.display()),
        });
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
        Err(err) => {
            eprintln!("fs_commands: read_dir({}) failed: {err}", path.display());
            return None;
        }
    };

    let mut children: Vec<TreeNode> = Vec::new();
    for entry in read {
        let entry = match entry {
            Ok(e) => e,
            Err(err) => {
                eprintln!("fs_commands: dir entry in {} failed: {err}", path.display());
                continue;
            }
        };
        let entry_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().to_string();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(err) => {
                eprintln!(
                    "fs_commands: file_type({}) failed: {err}",
                    entry_path.display()
                );
                continue;
            }
        };
        // Skip symlinks entirely while walking — they can leave the root and
        // we'd rather not show shortcuts to files we'd block on read anyway.
        if file_type.is_symlink() {
            continue;
        }
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
        return if dir_a {
            Ordering::Less
        } else {
            Ordering::Greater
        };
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
    let canonical = path.canonicalize().ok()?;
    let meta = fs::metadata(&canonical).ok()?;
    let kind = if meta.is_dir() {
        InitKind::Folder
    } else if meta.is_file() {
        InitKind::File
    } else {
        return None;
    };
    Some(InitTarget {
        kind,
        path: canonical,
    })
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

/// Extend Tauri's asset-protocol scope to include a newly-opened root, so
/// `convertFileSrc` URLs under that root are servable for images. The initial
/// scope is empty (see `tauri.conf.json`); we only ever widen it to roots the
/// user has explicitly opened, so this stays inside the sandbox.
fn extend_asset_scope<R: Runtime>(app: &AppHandle<R>, root: &Path) {
    let scope = app.asset_protocol_scope();
    if let Err(err) = scope.allow_directory(root, true) {
        eprintln!(
            "fs_commands: failed to widen asset scope for {}: {err}",
            root.display()
        );
    }
}

/// Open a folder for browsing: canonicalise, register as a root, return the
/// pruned tree and the resolved entry file in one round trip.
#[tauri::command]
pub fn open_folder<R: Runtime>(
    app: AppHandle<R>,
    roots: State<'_, OpenedRoots>,
    path: String,
) -> Result<OpenFolderResult, FsError> {
    let raw = PathBuf::from(&path);
    let canonical = roots.add(&raw).map_err(FsError::from)?;
    extend_asset_scope(&app, &canonical);

    let tree = build_tree(&canonical)?;
    let entry = resolve_entry_path(&canonical)?.map(|p| p.to_string_lossy().to_string());
    Ok(OpenFolderResult {
        root: canonical,
        tree,
        entry,
    })
}

#[derive(Serialize)]
pub struct OpenFolderResult {
    pub root: PathBuf,
    pub tree: Option<TreeNode>,
    pub entry: Option<String>,
}

/// Open a single file: canonicalise, register the file's directory as a
/// root, return the file's content.
#[tauri::command]
pub fn open_file<R: Runtime>(
    app: AppHandle<R>,
    roots: State<'_, OpenedRoots>,
    path: String,
) -> Result<FileRead, FsError> {
    let raw = PathBuf::from(&path);
    let canonical = roots.add(&raw).map_err(FsError::from)?;
    extend_asset_scope(&app, canonical.parent().unwrap_or(&canonical));
    read_file_checked(&roots, &canonical)
}

/// Read a file. Only succeeds if the canonicalised path is inside a
/// previously-opened root. This is the symlink-escape guard *and* the
/// path-traversal guard.
#[tauri::command]
pub fn read_file(
    roots: State<'_, OpenedRoots>,
    path: String,
) -> Result<FileRead, FsError> {
    let raw = PathBuf::from(&path);
    let canonical = raw.canonicalize().map_err(FsError::from)?;
    read_file_checked(&roots, &canonical)
}

fn read_file_checked(roots: &OpenedRoots, canonical: &Path) -> Result<FileRead, FsError> {
    if !roots.allows(canonical) {
        return Err(FsError::Forbidden {
            path: canonical.display().to_string(),
        });
    }
    let meta = fs::metadata(canonical)?;
    if !meta.is_file() {
        return Err(FsError::InvalidPath {
            message: format!("{} is not a regular file", canonical.display()),
        });
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(FsError::TooLarge {
            size: meta.len(),
            max: MAX_FILE_BYTES,
        });
    }
    let mut buf = String::with_capacity(meta.len() as usize);
    let mut file = fs::File::open(canonical)?;
    file.read_to_string(&mut buf)?;

    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    Ok(FileRead {
        path: canonical.to_path_buf(),
        content: buf,
        mtime,
    })
}

#[tauri::command]
pub fn list_dir<R: Runtime>(
    app: AppHandle<R>,
    roots: State<'_, OpenedRoots>,
    path: String,
) -> Result<TreeNode, FsError> {
    let raw = PathBuf::from(&path);
    let canonical = roots.add(&raw).map_err(FsError::from)?;
    extend_asset_scope(&app, &canonical);
    match build_tree(&canonical)? {
        Some(t) => Ok(t),
        None => Ok(TreeNode::Dir {
            name: canonical
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string(),
            path: canonical,
            children: vec![],
        }),
    }
}

#[tauri::command]
pub fn resolve_entry(
    roots: State<'_, OpenedRoots>,
    folder: String,
) -> Result<Option<String>, FsError> {
    let raw = PathBuf::from(&folder);
    let canonical = raw.canonicalize().map_err(FsError::from)?;
    if !roots.allows(&canonical) {
        return Err(FsError::Forbidden {
            path: canonical.display().to_string(),
        });
    }
    let resolved = resolve_entry_path(&canonical)?;
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

    // --- Sandbox / security tests -----------------------------------------

    #[test]
    fn read_file_rejects_paths_outside_any_root() {
        let dir = tempdir().unwrap();
        let inside = dir.path().join("ok.md");
        write(&inside, "ok");

        let roots = OpenedRoots::default();
        // No root registered yet.
        let err = read_file_checked(&roots, &inside.canonicalize().unwrap());
        assert!(matches!(err, Err(FsError::Forbidden { .. })));
    }

    #[test]
    fn read_file_accepts_paths_inside_a_root() {
        let dir = tempdir().unwrap();
        let inside = dir.path().join("ok.md");
        write(&inside, "ok");

        let roots = OpenedRoots::default();
        roots.add(dir.path()).unwrap();
        let out = read_file_checked(&roots, &inside.canonicalize().unwrap()).unwrap();
        assert_eq!(out.content, "ok");
    }

    #[test]
    fn read_file_rejects_traversal_outside_root() {
        let outer = tempdir().unwrap();
        let inner = outer.path().join("inner");
        fs::create_dir(&inner).unwrap();
        let secret = outer.path().join("secret.md");
        write(&secret, "hi");

        let roots = OpenedRoots::default();
        roots.add(&inner).unwrap();

        // Caller asks for the secret via a traversal-shaped path. Canonicalise
        // resolves it to the real secret path which is outside `inner`.
        let probe = inner.join("..").join("secret.md");
        let canonical = probe.canonicalize().unwrap();
        let err = read_file_checked(&roots, &canonical);
        assert!(matches!(err, Err(FsError::Forbidden { .. })), "got {err:?}");
    }

    #[cfg(unix)]
    #[test]
    fn read_file_rejects_symlink_that_escapes_root() {
        use std::os::unix::fs::symlink;
        let inner = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let secret = outside.path().join("secret.md");
        write(&secret, "do not read");

        let link = inner.path().join("evil.md");
        symlink(&secret, &link).unwrap();

        let roots = OpenedRoots::default();
        roots.add(inner.path()).unwrap();

        let canonical = link.canonicalize().unwrap(); // resolves to secret
        let err = read_file_checked(&roots, &canonical);
        assert!(matches!(err, Err(FsError::Forbidden { .. })), "got {err:?}");
    }

    #[test]
    fn read_file_rejects_files_larger_than_limit() {
        let dir = tempdir().unwrap();
        let big = dir.path().join("big.md");
        // 17 MiB > MAX_FILE_BYTES (16 MiB).
        let mut f = File::create(&big).unwrap();
        let chunk = vec![b'a'; 1024 * 1024];
        for _ in 0..17 {
            f.write_all(&chunk).unwrap();
        }

        let roots = OpenedRoots::default();
        roots.add(dir.path()).unwrap();
        let err = read_file_checked(&roots, &big.canonicalize().unwrap());
        assert!(matches!(err, Err(FsError::TooLarge { .. })), "got {err:?}");
    }

    #[test]
    fn read_file_rejects_non_regular_files() {
        let dir = tempdir().unwrap();
        let roots = OpenedRoots::default();
        roots.add(dir.path()).unwrap();
        let err = read_file_checked(&roots, &dir.path().canonicalize().unwrap());
        assert!(matches!(err, Err(FsError::InvalidPath { .. })), "got {err:?}");
    }

    fn v<const N: usize>(items: [&str; N]) -> Vec<String> {
        items.into_iter().map(|s| s.to_string()).collect()
    }

    fn write(path: &Path, content: &str) {
        let mut f = File::create(path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }
}
