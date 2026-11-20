import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Vard AI desktop: a static SPA loaded by Tauri. No server runtime.
// https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/harness/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "safari15",
    minify: process.env.TAURI_ENV_DEBUG ? false : true,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // The Firestore SDK is one ~560 kB module that can't be split further; everything
    // else stays under 200 kB. The app loads from disk in Tauri, so this is about
    // catching regressions, not download time.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Long-lived vendor code in its own chunks, so app changes don't invalidate it.
        // Firestore is most of Firebase, so it gets a chunk of its own.
        codeSplitting: {
          groups: [
            {
              name: "firestore",
              test: /node_modules[\\/](@firebase[\\/]firestore|firebase[\\/]firestore)[\\/]/,
              priority: 30,
            },
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 20 },
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
});
