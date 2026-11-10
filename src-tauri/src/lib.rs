//! Vard AI desktop shell.
//!
//! Responsibilities:
//! - Store provider API keys in the macOS Keychain. Keys never reach the WebView.
//! - Spawn and supervise the `vard-agent` sidecar (the TypeScript harness).
//! - Relay JSON-lines between the WebView and the sidecar, injecting API keys
//!   into outgoing requests on the way through.

mod oauth;

use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

const KEYCHAIN_SERVICE: &str = "ai.vard.desktop";
const PROVIDERS: &[&str] = &["anthropic", "openai", "google", "ollama", "openai-compatible"];
const EVENT_AGENT: &str = "agent://event";
const EVENT_AGENT_STATUS: &str = "agent://status";

#[derive(Default)]
struct Agent(Mutex<Option<CommandChild>>);

fn check_provider(provider: &str) -> Result<(), String> {
    if PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err(format!("unknown provider: {provider}"))
    }
}

fn entry(provider: &str) -> Result<keyring::Entry, String> {
    check_provider(provider)?;
    keyring::Entry::new(KEYCHAIN_SERVICE, provider).map_err(|e| e.to_string())
}

fn read_key(provider: &str) -> Option<String> {
    entry(provider).ok()?.get_password().ok()
}

#[tauri::command]
fn set_api_key(provider: String, key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("key is empty".into());
    }
    entry(&provider)?.set_password(key).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
    match entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Which providers have a key saved, plus a masked hint (last 4 characters).
#[tauri::command]
fn api_key_status() -> Value {
    let mut out = serde_json::Map::new();
    for p in PROVIDERS {
        let hint = read_key(p).map(|k| {
            let tail: String = k.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
            format!("••••{tail}")
        });
        out.insert((*p).into(), hint.map(Value::String).unwrap_or(Value::Null));
    }
    Value::Object(out)
}

/// Providers that can't be called without a key.
const KEYED: &[&str] = &["anthropic", "openai", "google", "openai-compatible"];

fn provider_label(p: &str) -> &str {
    match p {
        "anthropic" => "Anthropic",
        "openai" => "OpenAI",
        "google" => "Google Gemini",
        "openai-compatible" => "OpenRouter",
        other => other,
    }
}

/// Adds `apiKey` to any object in the request that names a `provider`
/// (top level, or a nested `provider` / `model` object, as in the harness's
/// `ProviderConfig`) and has no key of its own. Fails with a readable message
/// when a provider needs a key and none is saved (or macOS denies access).
fn inject_keys(msg: &mut Value) -> Result<(), String> {
    fn fill(obj: &mut Value) -> Result<(), String> {
        let Some(map) = obj.as_object_mut() else { return Ok(()) };
        let Some(p) = map.get("provider").and_then(Value::as_str).map(str::to_owned) else {
            return Ok(());
        };
        if map.contains_key("apiKey") {
            return Ok(());
        }
        match entry(&p).and_then(|e| e.get_password().map_err(|e| e.to_string())) {
            Ok(k) => {
                map.insert("apiKey".into(), Value::String(k));
                Ok(())
            }
            Err(e) if KEYED.contains(&p.as_str()) => {
                eprintln!("[vard] no usable {p} key: {e}");
                Err(format!(
                    "No {} API key saved. Add one in Settings → API keys.",
                    provider_label(&p)
                ))
            }
            Err(_) => Ok(()),
        }
    }
    fill(msg)?;
    for nested in ["provider", "model"] {
        if let Some(v) = msg.get_mut(nested) {
            fill(v)?;
        }
    }
    Ok(())
}

fn spawn_agent(app: &AppHandle) -> Result<(), String> {
    let (mut rx, child) = app
        .shell()
        .sidecar("vard-agent")
        .map_err(|e| e.to_string())?
        .spawn()
        .map_err(|e| e.to_string())?;

    *app.state::<Agent>().0.lock().unwrap() = Some(child);
    let _ = app.emit(EVENT_AGENT_STATUS, "running");

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Sidecar stdout is JSON-lines; partial lines are buffered until '\n'.
        let mut buf = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    buf.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(i) = buf.find('\n') {
                        let line: String = buf.drain(..=i).collect();
                        let line = line.trim();
                        if line.is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<Value>(line) {
                            Ok(v) => {
                                let _ = app.emit(EVENT_AGENT, v);
                            }
                            Err(_) => eprintln!("[vard-agent] {line}"),
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    eprint!("[vard-agent] {}", String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Terminated(status) => {
                    *app.state::<Agent>().0.lock().unwrap() = None;
                    let _ = app.emit(EVENT_AGENT_STATUS, format!("stopped:{:?}", status.code));
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

/// Send one request to the sidecar, starting it first if needed.
#[tauri::command]
fn agent_send(app: AppHandle, agent: State<'_, Agent>, mut message: Value) -> Result<(), String> {
    if agent.0.lock().unwrap().is_none() {
        spawn_agent(&app)?;
    }
    inject_keys(&mut message)?;
    let mut line = serde_json::to_vec(&message).map_err(|e| e.to_string())?;
    line.push(b'\n');
    let mut guard = agent.0.lock().unwrap();
    let child = guard.as_mut().ok_or("agent is not running")?;
    child.write(&line).map_err(|e| e.to_string())
}

#[tauri::command]
fn agent_restart(app: AppHandle, agent: State<'_, Agent>) -> Result<(), String> {
    if let Some(child) = agent.0.lock().unwrap().take() {
        let _ = child.kill();
    }
    spawn_agent(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Agent::default())
        .invoke_handler(tauri::generate_handler![
            set_api_key,
            delete_api_key,
            api_key_status,
            agent_send,
            agent_restart,
            oauth::google_sign_in
        ])
        .build(tauri::generate_context!())
        .expect("error while building Vard AI")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(child) = app.state::<Agent>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
