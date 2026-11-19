// Keep tests away from the real ~/.vard (skills state, MCP config, trust files).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.VARD_TEST_KEEP_HOME)
  process.env.VARD_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "vard-test-home-"));
