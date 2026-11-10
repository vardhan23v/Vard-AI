//! Google sign-in for the desktop app (OAuth 2.0 for installed apps, with PKCE).
//!
//! 1. Bind a one-shot loopback server on 127.0.0.1:47823.
//! 2. Open Google's consent page in the system browser.
//! 3. Google redirects to http://127.0.0.1:47823/auth/callback?code=…&state=…
//! 4. Check `state`, exchange the code (with the PKCE verifier) for tokens.
//! 5. Return Google's ID token; the WebView signs in to Firebase with it.
//!
//! Desktop OAuth clients accept any loopback port, so nothing needs to be
//! registered per machine. Google documents that a desktop client's secret is
//! not confidential; PKCE is what protects the code.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const PORT: u16 = 47823;
const PATH: &str = "/auth/callback";
const WAIT: Duration = Duration::from_secs(300);

fn page(title: &str, body: &str) -> String {
    format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Vard AI</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#1d274e;color:#cfcfbb;font:16px/1.5 -apple-system,system-ui,sans-serif}}
main{{text-align:center;padding:24px}}h1{{font:600 24px Georgia,serif;margin:0 0 8px}}p{{color:#abb9b3;margin:0}}</style></head>
<body><main><h1>{title}</h1><p>{body}</p></main></body></html>"#
    )
}

fn respond(mut stream: &TcpStream, status: &str, html: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
}

fn random_b64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

fn query_param(target: &str, key: &str) -> Option<String> {
    let query = target.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| percent_decode(v))
    })
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => match u8::from_str_radix(&s[i + 1..i + 3], 16) {
                Ok(b) => {
                    out.push(b);
                    i += 3;
                    continue;
                }
                Err(_) => out.push(b'%'),
            },
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Wait for Google's redirect; returns (code, state).
fn wait_for_callback(listener: TcpListener) -> Result<(String, String), String> {
    let deadline = Instant::now() + WAIT;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let mut line = String::new();
                if BufReader::new(&stream).read_line(&mut line).is_err() {
                    continue;
                }
                let target = line.split_whitespace().nth(1).unwrap_or("").to_string();
                if !target.starts_with(PATH) {
                    respond(&stream, "404 Not Found", "");
                    continue;
                }
                if let Some(err) = query_param(&target, "error") {
                    respond(&stream, "200 OK", &page("Sign-in cancelled", "You can close this tab and try again in Vard AI."));
                    return Err(if err == "access_denied" { "Sign-in was cancelled.".into() } else { err });
                }
                let code = query_param(&target, "code").ok_or("Google didn't return a sign-in code.")?;
                let state = query_param(&target, "state").unwrap_or_default();
                respond(&stream, "200 OK", &page("You're signed in", "You can close this tab and return to Vard AI."));
                return Ok((code, state));
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(150)),
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Sign-in timed out. Please try again.".into())
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

/// Run Google's sign-in in the system browser and return a Google ID token.
#[tauri::command]
pub async fn google_sign_in(app: AppHandle, client_id: String, client_secret: String) -> Result<String, String> {
    if client_id.trim().is_empty() {
        return Err("Google sign-in isn't configured (VITE_GOOGLE_DESKTOP_CLIENT_ID is empty).".into());
    }
    let listener = TcpListener::bind(("127.0.0.1", PORT))
        .map_err(|e| format!("Sign-in port {PORT} is busy ({e}). Close other Vard AI windows and try again."))?;
    let redirect_uri = format!("http://127.0.0.1:{PORT}{PATH}");

    let verifier = random_b64(32);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = random_b64(16);

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&prompt=select_account",
        encode(&client_id),
        encode(&redirect_uri),
        encode("openid email profile"),
        challenge,
        state
    );
    app.opener().open_url(auth_url, None::<&str>).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        let (code, returned_state) = wait_for_callback(listener)?;
        if returned_state != state {
            return Err("Sign-in response didn't match this request. Please try again.".to_string());
        }
        let resp = ureq::post("https://oauth2.googleapis.com/token").send_form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code_verifier", verifier.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ]);
        let body: TokenResponse = match resp {
            Ok(r) => r.into_json().map_err(|e| e.to_string())?,
            Err(ureq::Error::Status(_, r)) => r.into_json().map_err(|e| e.to_string())?,
            Err(e) => return Err(format!("Couldn't reach Google: {e}")),
        };
        if let Some(t) = body.id_token {
            return Ok(t);
        }
        Err(body.error_description.or(body.error).unwrap_or_else(|| "Google didn't return an ID token.".into()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_query() {
        let t = "/auth/callback?state=ab%2Fc&code=4%2F0Ad-x&scope=email+openid";
        assert_eq!(query_param(t, "code").as_deref(), Some("4/0Ad-x"));
        assert_eq!(query_param(t, "state").as_deref(), Some("ab/c"));
        assert_eq!(query_param(t, "scope").as_deref(), Some("email openid"));
        assert_eq!(query_param(t, "missing"), None);
    }

    #[test]
    fn encodes_url_components() {
        assert_eq!(encode("http://127.0.0.1:1/a b"), "http%3A%2F%2F127.0.0.1%3A1%2Fa%20b");
    }
}
