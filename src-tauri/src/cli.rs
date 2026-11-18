//! "Install command-line tool": links `/usr/local/bin/vard` to the `vard` binary inside the app
//! bundle (the same binary the app runs as its agent sidecar). Asks for an administrator
//! password through macOS only when /usr/local/bin isn't writable.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

const LINK: &str = "/usr/local/bin/vard";

#[derive(Serialize)]
pub struct CliStatus {
    /// Where the link goes.
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

fn status_of(bin: &Path) -> CliStatus {
    let link = Path::new(LINK);
    let (installed, conflict) = match std::fs::symlink_metadata(link) {
        Err(_) => (false, None),
        Ok(meta) if meta.file_type().is_symlink() => match std::fs::read_link(link) {
            Ok(target) if target == bin => (true, None),
            Ok(target) => (false, Some(target.display().to_string())),
            Err(e) => (false, Some(e.to_string())),
        },
        Ok(_) => (false, Some(format!("{LINK} is a regular file"))),
    };
    CliStatus { link: LINK.into(), bundled: bin.display().to_string(), installed, conflict }
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

#[tauri::command]
pub fn install_cli() -> Result<CliStatus, String> {
    let bin = bundled()?;
    let st = status_of(&bin);
    if st.installed {
        return Ok(st);
    }
    let link = Path::new(LINK);
    // Never replace a real file someone else put there; a stale link (e.g. an old app copy) is fine.
    if let Ok(meta) = std::fs::symlink_metadata(link) {
        if !meta.file_type().is_symlink() {
            return Err(format!("{LINK} already exists and isn't a link. Remove it first, then try again."));
        }
    }
    let direct = (|| -> std::io::Result<()> {
        std::fs::create_dir_all("/usr/local/bin")?;
        if std::fs::symlink_metadata(link).is_ok() {
            std::fs::remove_file(link)?;
        }
        std::os::unix::fs::symlink(&bin, link)
    })();
    if direct.is_err() {
        let src = shell_quote(&bin)?;
        run_as_admin(&format!("mkdir -p /usr/local/bin && ln -sfn {src} {LINK}"))?;
    }
    Ok(status_of(&bin))
}

#[tauri::command]
pub fn uninstall_cli() -> Result<CliStatus, String> {
    let bin = bundled()?;
    let st = status_of(&bin);
    if !st.installed {
        return Ok(st);
    }
    if std::fs::remove_file(LINK).is_err() {
        run_as_admin(&format!("rm -f {LINK}"))?;
    }
    Ok(status_of(&bin))
}
