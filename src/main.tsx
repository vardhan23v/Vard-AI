import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

import { getRouter } from "./router";
import { THEME_INIT_SCRIPT } from "./lib/theme";
import { MOTION_INIT_SCRIPT } from "./lib/motion";

// Apply saved theme and motion preferences before first paint.
for (const script of [THEME_INIT_SCRIPT, MOTION_INIT_SCRIPT]) {
  try {
    new Function(script)();
  } catch {
    // Preferences are optional; defaults apply.
  }
}

const router = getRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
