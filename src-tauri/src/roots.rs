//! Sandbox: track the set of filesystem roots the user has explicitly opened.
//!
//! Every read goes through one of these roots. A path is allowed iff its
//! canonical form is under an allowed root — which is also the symlink-escape
//! check, because `canonicalize` follows symlinks before we compare.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Maximum bytes returned by `read_file`. Tuned for "reasonable markdown",
/// not arbitrary file viewing. 16 MiB is comfortably above any realistic
/// document and well below memory-pressure territory.
pub const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;

/// Application state: the set of opened root directories.
///
/// Mutex contention is irrelevant here — the only writers are
/// `add` (called once per Open File / Open Folder) and the only readers are
/// the IPC commands.
pub struct OpenedRoots {
    inner: Mutex<Vec<PathBuf>>,
}

impl Default for OpenedRoots {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Vec::new()),
        }
    }
}

impl OpenedRoots {
    /// Register a path as an allowed root. Returns the canonical form so
    /// the caller can hand it back to the frontend with a stable identity.
    /// For files we record the parent directory.
    pub fn add(&self, raw: &Path) -> std::io::Result<PathBuf> {
        let canonical = raw.canonicalize()?;
        let root_dir = if canonical.is_file() {
            canonical
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| canonical.clone())
        } else {
            canonical.clone()
        };

        let mut roots = self.inner.lock().expect("roots lock poisoned");
        if !roots.iter().any(|r| *r == root_dir) {
            roots.push(root_dir);
        }
        Ok(canonical)
    }

    /// True iff `path` is exactly an allowed root or a descendant of one.
    /// Caller must pass a canonical path.
    pub fn allows(&self, canonical: &Path) -> bool {
        let roots = self.inner.lock().expect("roots lock poisoned");
        roots.iter().any(|r| canonical.starts_with(r))
    }

    /// Snapshot of roots — used by integration tests and by the dynamic
    /// asset-protocol scope updater.
    pub fn snapshot(&self) -> Vec<PathBuf> {
        self.inner
            .lock()
            .expect("roots lock poisoned")
            .clone()
    }
}
