# Working on Vard AI

Vard AI is a macOS desktop app (Tauri v2) with a chat and a coding agent. Read [README.md](README.md) first.

## Layout

| Path | What it is |
|---|---|
| `src/` | React 19 SPA (TanStack Router file routes, Tailwind v4, shadcn/ui) |
| `src/features/chat/`, `src/features/agent/` | Chat and Projects (agent) features |
| `src/lib/agent-client.ts` | Typed bridge to the sidecar; types come from `harness/src/protocol.ts` |
| `src/lib/firebase.ts` | Firebase Auth + Firestore (data under `users/{uid}/…`) |
| `src-tauri/` | Rust shell: Keychain keys, sidecar relay, Google OAuth (`src/oauth.rs`) |
| `harness/` | Agent harness, compiled into the `vard` binary: the app's sidecar (`vard agent --stdio`) and the CLI (`harness/src/cli/`, full-screen UI in `harness/src/tui/`); has its own `package.json` |
| `harness/src/mcp/` | MCP client: `config` (global/project, trust, import), `secrets` (Keychain), `transport`, `client` (lifecycle), `manager`, `tools`, `resources`, `prompts`, `permissions` (used by `policy.ts`), `security`, `oauth` |
| `src/features/mcp/` | Integrations UI (`/integrations` route) |
| `harness/src/skills/` | Skills: `schema` (shared types), `parser` (strict YAML subset), `validator`, `loader`, `registry` (trust, shadowing, usage), `resolver` (ranking), `activation` (prompt block, `skill_read_resource`, `skill_run_script`), `manager`; built-ins in `harness/skills/<name>/SKILL.md` |
| `harness/src/agents/` | Team runs: `schema` (shared types), `registry` (roles), `planner`, `dependencies` (DAG), `scheduler`, `worker` (one AgentLoop per agent), `integrator` (worktrees + `git merge-tree`), `reviewer`, `orchestrator` |
| `harness/src/intelligence/` | Code index: `schema` (shared types), `scanner`, `languages` (tree-sitter grammars and queries), `parser`, `store` (bun:sqlite + FTS5), `indexer` (incremental), `resolve` (imports), `graph`, `search` (hybrid), `embeddings` (optional), `impact`, `overview`, `tools` (`code_*`), `watcher` |
| `harness/src/browser/` | Browser agent: `schema` (shared types), `install` (find or download Chromium), `manager`/`session` (isolated contexts, crash recovery), `permissions` (URL policy, sensitive actions, redaction), `inspect` (DOM measurements), `testing` (responsive reports), `devserver`, `artifacts`, `tools` (`browser_*`, `dev_server_*`) |
| `src/features/code/`, `src/features/browser/` | Code page (`/code`) and Browser page (`/browser`); the task view's browser panel |
| `src/features/skills/`, `src/features/agents/` | Skills page (`/skills`), Agents page (`/agents`) and the team dashboard shown in a team task |
| `harness/src/memory/` | Project memory (`<project>/.vard/memory.json`): `schema` (shared types), `store`, `analyze`, `recall`, `reflect`, `secrets` |
| `firestore.rules` | Security rules; deploy with `bunx firebase-tools deploy --only firestore` |

## Commands

```bash
bun run typecheck             # app types
bun run lint                  # app ESLint + Prettier (CI fails on errors)
bun run build                 # web UI into dist/ (watch for chunk-size warnings)
cd harness && bunx tsc --noEmit   # harness types
cd harness && bun test        # harness tests (test/setup.ts keeps them away from your ~/.vard)
bun run desktop:dev           # run the app (needs Rust on PATH)
bun run desktop:build         # universal DMG
```

## Rules

- **Keys:** API keys never go to the WebView or into files. They live in the macOS Keychain (service `ai.vard.desktop`), and the Rust shell injects them into sidecar requests. The CLI reads the same items, or env vars.
- **Protocol:** keep `harness/src/protocol.ts` and the UI in step. The UI imports its types.
- **Skills:** skill text is untrusted guidance. Keep it wrapped in the prompt, never let it grant permissions, keep every skill path inside its folder, and keep `skill_run_script` asking every time (`ToolDef.alwaysAsk`).
- **Teams:** there's one agent loop. Team agents are `AgentLoop`s with role-filtered tools; don't add a second execution path, and don't bypass `Policy`, approvals or the integrator's conflict check. Team events carry `agentId` and `seq`.
- **Browser:** browser tools have risk `browser` (URL policy and sensitive-action confirmation in `browser/permissions.ts`). Navigation checks happen in the session's network guard too; keep both. Never use a personal browser profile, never bundle a browser, keep page content wrapped as untrusted, and redact URLs before they reach events, logs or the model. Tests drive a real Chromium (`vard browser install` locally; CI installs it) and skip with a warning when there's none.
- **Code index:** stays in `.vard/index`, separate from project memory. Never index or embed sensitive files, and keep `code_*` tools read-only and confined to the project.
- **MCP:** external tools always go through `Policy.decide` and the approval flow. Never give an MCP server Vard's environment or secrets, and keep MCP output wrapped as untrusted. Tests use the mock servers in `harness/test/fixtures/mcp/`.
- **Theme:** use the tokens in `src/styles.css`. Don't hard-code colours.
- **Generated files:** don't edit `src/routeTree.gen.ts` by hand.
- **Secrets:** `.env` holds build-time public config and is git-ignored. Never commit `.env`.
