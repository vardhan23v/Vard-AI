//! "Install command-line tool": links `vard` in a folder on the user's shell PATH to the `vard`
//! binary inside the app bundle (the same binary the app runs as its agent sidecar).
//!
//! It prefers a folder the user can already write to (`/usr/local/bin`, `/opt/homebrew/bin`,
//! `~/.local/bin`, `~/bin`) and only asks for an administrator password, through macOS, when none
//! of those is on PATH and `/usr/local/bin` has to be created.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

const SYSTEM_DIR: &str = "/usr/local/bin";

#[derive(Serialize)]
pub struct CliStatus {
    /// Where the link is (or would go).
    link: String,
    /// The bundled binary it should point to.
    bundled: String,
    /// The link exists and points at this app's binary.
    installed: bool,
    /// Something else is at the link path (another file or another app's binary).
    conflict: Option<String>,
}

fn bundled() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let bin = exe.parent().ok_or("no app folder")?.join("vard");
    if !bin.exists() {
        return Err(format!("The vard binary is missing from the app ({}). Reinstall Vard AI.", bin.display()));
    }
    Ok(bin)
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

/// The PATH a new Terminal window gets. Apps started from Finder don't inherit it, so ask the
/// user's login shell (with a timeout, in case a shell profile hangs).
fn shell_path() -> Vec<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let child = Command::new(&shell)
        .args(["-lic", "printf '%s' \"$PATH\""])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn();
    let Ok(mut child) = child else { return vec![] };
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                return vec![];
            }
        }
    }
    let out = child.wait_with_output().map(|o| o.stdout).unwrap_or_default();
    // Profiles can print banners; the PATH is the last line.
    let text = String::from_utf8_lossy(&out);
    text.lines().last().unwrap_or("").split(':').filter(|s| !s.is_empty()).map(PathBuf::from).collect()
}

fn writable(dir: &Path) -> bool {
    std::fs::metadata(dir).map(|m| m.is_dir()).unwrap_or(false)
        && tempfile_probe(dir)
}

fn tempfile_probe(dir: &Path) -> bool {
    let probe = dir.join(format!(".vard-write-test-{}", std::process::id()));
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

/// Folders where a link could live, in order of preference.
fn candidates() -> Vec<PathBuf> {
    let h = home();
    vec![
        PathBuf::from(SYSTEM_DIR),
        PathBuf::from("/opt/homebrew/bin"),
        h.join(".local/bin"),
        h.join("bin"),
    ]
}

fn link_state(link: &Path, bin: &Path) -> Option<Result<(), String>> {
    let meta = std::fs::symlink_metadata(link).ok()?;
    if !meta.file_type().is_symlink() {
        return Some(Err(format!("{} is a regular file", link.display())));
    }
    Some(match std::fs::read_link(link) {
        Ok(t) if t == bin => Ok(()),
        Ok(t) => Err(t.display().to_string()),
        Err(e) => Err(e.to_string()),
    })
}

fn status_of(bin: &Path) -> CliStatus {
    let mut conflict = None;
    for dir in candidates() {
        let link = dir.join("vard");
        match link_state(&link, bin) {
            Some(Ok(())) => {
                return CliStatus { link: link.display().to_string(), bundled: bin.display().to_string(), installed: true, conflict: None }
            }
            Some(Err(e)) if conflict.is_none() => conflict = Some((link, e)),
            _ => {}
        }
    }
    let (link, conflict) = match conflict {
        Some((l, e)) => (l.display().to_string(), Some(e)),
        None => (format!("{SYSTEM_DIR}/vard"), None),
    };
    CliStatus { link, bundled: bin.display().to_string(), installed: false, conflict }
}

#[tauri::command]
pub fn cli_status() -> Result<CliStatus, String> {
    Ok(status_of(&bundled()?))
}

/// Runs a shell command as administrator via the macOS password prompt.
fn run_as_admin(script: &str) -> Result<(), String> {
    let escaped = script.replace('\\', "\\\\").replace('"', "\\\"");
    let out = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(format!("do shell script \"{escaped}\" with administrator privileges"))
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&out.stderr);
    if err.contains("-128") {
        Err("Cancelled.".into())
    } else {
        Err(err.trim().to_string())
    }
}

fn shell_quote(p: &Path) -> Result<String, String> {
    let s = p.display().to_string();
    if s.contains('\'') {
        return Err("The app's path contains a quote; move Vard AI to /Applications.".into());
    }
    Ok(format!("'{s}'"))
}

/// Replace a stale link (or nothing) with one to `bin`. Never replaces a real file.
fn link_into(dir: &Path, bin: &Path) -> Result<PathBuf, String> {
    let link = dir.join("vard");
    if let Ok(meta) = std::fs::symlink_metadata(&link) {
        if !meta.file_type().is_symlink() {
            return Err(format!("{} already exists and isn't a link. Remove it first, then try again.", link.display()));
        }
        std::fs::remove_file(&link).map_err(|e| e.to_string())?;
    }
    std::os::unix::fs::symlink(bin, &link).map_err(|e| e.to_string())?;
    Ok(link)
}

#[tauri::command]
pub fn install_cli() -> Result<CliStatus, String> {
    let bin = bundled()?;
    let st = status_of(&bin);
    if st.installed {
        return Ok(st);
    }
    let path = shell_path();
    // A folder on the shell's PATH that the user can write to: no password needed.
    for dir in candidates() {
        if path.contains(&dir) && writable(&dir) {
            link_into(&dir, &bin)?;
            return Ok(status_of(&bin));
        }
    }
    // Otherwise create /usr/local/bin (on PATH by default on macOS) as administrator.
    let src = shell_quote(&bin)?;
    run_as_admin(&format!("mkdir -p {SYSTEM_DIR} && ln -sfn {src} {SYSTEM_DIR}/vard"))?;
    Ok(status_of(&bin))
}

#[tauri::command]
pub fn uninstall_cli() -> Result<CliStatus, String> {
    let bin = bundled()?;
    let st = status_of(&bin);
    if !st.installed {
        return Ok(st);
    }
    if std::fs::remove_file(&st.link).is_err() {
        run_as_admin(&format!("rm -f '{}'", st.link))?;
    }
    Ok(status_of(&bin))
}
