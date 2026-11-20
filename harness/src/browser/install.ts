/**
 * Finding a Chromium to drive, and installing one on request.
 *
 * Order: $VARD_CHROMIUM, Playwright's browser cache (any version), then browsers in /Applications
 * (Chrome, Edge, Brave, Chromium). Nothing is bundled with Vard. "Install" downloads Playwright's
 * Chrome Headless Shell for the version this build of Playwright expects (about 90 MB) into
 * Playwright's own cache folder, the same place `npx playwright install` uses.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Not in the package's exports map, so it's imported by path (bundled into the binary at build time).
import browsersJson from "../../node_modules/playwright-core/browsers.json" with { type: "json" };
import { run } from "../util";
import { BrowserError } from "./errors";
import type { BrowserInstall } from "./schema";

const CDN = "https://cdn.playwright.dev";

export function playwrightCacheDir(env = process.env): string {
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0")
    return env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.platform === "darwin")
    return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  if (process.platform === "win32")
    return path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "ms-playwright");
}

function platformTag(): { dir: string; zip: string; cft: string } | null {
  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "mac-arm64" : "mac-x64";
    return {
      dir: `chrome-headless-shell-${arch}`,
      zip: `chrome-headless-shell-${arch}.zip`,
      cft: arch,
    };
  }
  if (process.platform === "linux" && process.arch === "x64")
    return {
      dir: "chrome-headless-shell-linux64",
      zip: "chrome-headless-shell-linux64.zip",
      cft: "linux64",
    };
  return null;
}

const SYSTEM_BROWSERS: [string, string][] = [
  ["Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  ["Microsoft Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  ["Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
  ["Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  ["Chromium", "/usr/bin/chromium"],
  ["Chromium", "/usr/bin/chromium-browser"],
  ["Google Chrome", "/usr/bin/google-chrome"],
];

const exists = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Executables in Playwright's cache, newest build first. */
function fromPlaywrightCache(env = process.env): { exe: string; name: string; version: string }[] {
  const dir = playwrightCacheDir(env);
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { exe: string; name: string; version: string; build: number }[] = [];
  for (const e of entries) {
    const m = /^(chromium_headless_shell|chromium)-(\d+)$/.exec(e);
    if (!m) continue;
    const base = path.join(dir, e);
    const cands =
      m[1] === "chromium_headless_shell"
        ? [
            "chrome-headless-shell-mac-arm64/chrome-headless-shell",
            "chrome-headless-shell-mac-x64/chrome-headless-shell",
            "chrome-headless-shell-linux64/chrome-headless-shell",
            "chrome-linux/headless_shell",
          ]
        : [
            "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
            "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
            "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
            "chrome-linux64/chrome",
            "chrome-linux/chrome",
          ];
    for (const c of cands)
      if (exists(path.join(base, c)) && fs.existsSync(path.join(base, "INSTALLATION_COMPLETE")))
        out.push({
          exe: path.join(base, c),
          name:
            m[1] === "chromium" ? "Chromium (Playwright)" : "Chrome Headless Shell (Playwright)",
          version: `build ${m[2]}`,
          build: Number(m[2]) + (m[1] === "chromium_headless_shell" ? 0.5 : 0),
        });
  }
  return out.sort((a, b) => b.build - a.build);
}

export function detectBrowser(env = process.env): BrowserInstall {
  const shell = (
    browsersJson as { browsers: { name: string; revision: string; browserVersion?: string }[] }
  ).browsers.find((b) => b.name === "chromium-headless-shell");
  const tag = platformTag();
  const installable =
    shell?.browserVersion && tag
      ? {
          name: "Chrome Headless Shell",
          version: shell.browserVersion,
          url: `${CDN}/builds/cft/${shell.browserVersion}/${tag.cft}/${tag.zip}`,
          approxMB: 90,
        }
      : undefined;
  if (env.VARD_CHROMIUM && exists(env.VARD_CHROMIUM))
    return {
      installed: true,
      executable: env.VARD_CHROMIUM,
      source: "env",
      name: "Chromium ($VARD_CHROMIUM)",
      installable,
    };
  const pw = fromPlaywrightCache(env)[0];
  if (pw)
    return {
      installed: true,
      executable: pw.exe,
      source: "playwright",
      name: pw.name,
      version: pw.version,
      installable,
    };
  for (const [name, exe] of SYSTEM_BROWSERS)
    if (exists(exe))
      return { installed: true, executable: exe, source: "system", name, installable };
  return { installed: false, installable };
}

/**
 * Downloads and unpacks Chrome Headless Shell into Playwright's cache. Only ever called because
 * the user asked (Install button or `vard browser install`).
 */
export async function installBrowser(
  o: {
    onProgress?: (received: number, total: number) => void;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<BrowserInstall> {
  const env = o.env ?? process.env;
  const shell = (
    browsersJson as { browsers: { name: string; revision: string; browserVersion?: string }[] }
  ).browsers.find((b) => b.name === "chromium-headless-shell");
  const tag = platformTag();
  if (!shell?.browserVersion || !tag)
    throw new BrowserError(
      "install",
      "Installing a browser isn't supported on this platform. Install Google Chrome, or set VARD_CHROMIUM.",
    );
  const url = `${CDN}/builds/cft/${shell.browserVersion}/${tag.cft}/${tag.zip}`;
  const dest = path.join(playwrightCacheDir(env), `chromium_headless_shell-${shell.revision}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vard-browser-"));
  try {
    const res = await fetch(url, { signal: o.signal });
    if (!res.ok || !res.body)
      throw new BrowserError("install", `Download failed: HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length") ?? 0);
    const zip = path.join(tmp, tag.zip);
    const out = fs.createWriteStream(zip);
    let received = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
      o.onProgress?.(received, total);
    }
    await new Promise<void>((r, j) => out.end((e?: Error | null) => (e ? j(e) : r())));
    if (total && received !== total) throw new BrowserError("install", "Download was incomplete.");
    fs.mkdirSync(dest, { recursive: true });
    const unzip =
      process.platform === "darwin"
        ? ["ditto", "-x", "-k", zip, dest]
        : ["unzip", "-q", "-o", zip, "-d", dest];
    const r = await run(unzip, { cwd: tmp, timeoutMs: 300_000 });
    if (r.code !== 0)
      throw new BrowserError(
        "install",
        `Unpacking failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`,
      );
    const exe = path.join(dest, tag.dir, "chrome-headless-shell");
    if (!exists(exe))
      throw new BrowserError("install", "The download didn't contain the expected browser.");
    fs.chmodSync(exe, 0o755);
    fs.writeFileSync(path.join(dest, "INSTALLATION_COMPLETE"), "");
    fs.writeFileSync(path.join(dest, "DEPENDENCIES_VALIDATED"), "");
    return detectBrowser(env);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
