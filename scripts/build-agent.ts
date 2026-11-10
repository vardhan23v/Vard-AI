#!/usr/bin/env bun
/**
 * Compiles the harness (harness/src/main.ts) into the `vard-agent` sidecar
 * binary and places it where Tauri's `externalBin` expects it:
 *   src-tauri/binaries/vard-agent-<target-triple>
 *
 * Usage:
 *   bun scripts/build-agent.ts             # host architecture only
 *   bun scripts/build-agent.ts --universal # arm64 + x64, plus a lipo'd universal binary
 */
import { $ } from "bun";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const entry = join(root, "harness/src/main.ts");
const outDir = join(root, "src-tauri/binaries");

if (!existsSync(entry)) {
  console.error(`Missing ${entry}. The harness package must provide its stdio entry point.`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const targets = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
} as const;

const universal = process.argv.includes("--universal");
const host = process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
const wanted = universal ? (Object.keys(targets) as (keyof typeof targets)[]) : [host];

// Harness dependencies live in harness/node_modules.
await $`bun install`.cwd(join(root, "harness")).quiet();

for (const triple of wanted) {
  const out = join(outDir, `vard-agent-${triple}`);
  console.log(`Building ${out}`);
  await $`bun build ${entry} --compile --minify --target=${targets[triple]} --outfile ${out}`.cwd(
    join(root, "harness"),
  );
}

if (universal) {
  const out = join(outDir, "vard-agent-universal-apple-darwin");
  await $`lipo -create -output ${out} ${join(outDir, "vard-agent-aarch64-apple-darwin")} ${join(outDir, "vard-agent-x86_64-apple-darwin")}`;
  console.log(`Built ${out}`);
}
