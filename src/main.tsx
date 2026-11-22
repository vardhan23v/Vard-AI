import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

import { THEME_INIT_SCRIPT } from "./lib/theme";
import { MOTION_INIT_SCRIPT } from "./lib/motion";
import { bootLog, installErrorLogging, mark, warmUpStorage } from "./lib/boot";

installErrorLogging();
mark("boot");

// Apply saved theme and motion preferences before first paint.
for (const script of [THEME_INIT_SCRIPT, MOTION_INIT_SCRIPT]) {
  try {
    new Function(script)();
  } catch {
    // Preferences are optional; defaults apply.
  }
}

// Firebase (pulled in by the router's routes) picks its storage when it loads, so make sure
// IndexedDB answers first; until then the splash in index.html stays up.
await warmUpStorage();

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof import("./router").getRouter>;
  }
}

try {
  const { getRouter } = await import("./router");
  const router = getRouter();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  bootLog("router mounted");
} catch (e) {
  // The app code failed to load (bad build config, a module that throws on import). Say so on
  // the splash instead of leaving it up forever.
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  bootLog(`startup failed ${message}`);
  showStartupFailure(message);
}

function showStartupFailure(message: string) {
  const splash = document.getElementById("boot-splash");
  if (!splash) return;
  const text = splash.querySelector("p");
  if (text) {
    text.textContent = "Vard couldn't start. Reload the window to try again.";
    text.style.animation = "none";
    text.style.opacity = "1";
  }
  const detail = document.createElement("code");
  detail.textContent = message.slice(0, 300);
  detail.style.cssText = "max-width:420px;font-size:12px;opacity:.7;text-align:center;";
  const reload = document.createElement("button");
  reload.textContent = "Reload window";
  reload.style.cssText =
    "padding:8px 16px;border-radius:6px;border:0;background:var(--primary);color:var(--primary-foreground);font:inherit;cursor:pointer;";
  // A failed start reloads in ~20 ms and draws this button in the same place, so every click of
  // a double-click (or impatient clicking) landed on a fresh copy and reloaded again, which
  // looked like a reload loop. Ignore clicks for a moment after it appears, and take only one.
  const setEnabled = (on: boolean) => {
    reload.disabled = !on;
    reload.style.opacity = on ? "1" : "0.5";
    reload.style.cursor = on ? "pointer" : "default";
  };
  setEnabled(false);
  setTimeout(() => setEnabled(true), 1000);
  reload.onclick = () => {
    setEnabled(false);
    reload.textContent = "Reloading…";
    bootLog("startup reload requested");
    window.location.reload();
  };
  splash.append(detail, reload);
}
