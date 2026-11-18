# Vard AI harness

The coding agent behind Vard AI. A self-contained Bun/TypeScript package compiled to one binary,
`vard`, with two modes:

- `vard agent --stdio`: the sidecar the Tauri shell spawns and talks to over JSON lines on stdio.
- anything else: the `vard` command-line tool (`src/cli/`), which runs the same `Server` in-process.

```bash
bun install
bun test          # unit + mock-model end-to-end tests
bun run typecheck
bun run build     # -> dist/vard
printf '{"id":"1","type":"ping"}\n' | ./dist/vard agent --stdio
./dist/vard --help
```

## Protocol (`src/protocol.ts`)

One JSON request per stdin line, one JSON event per stdout line. Events echo the request `id`,
and task events carry `taskId`. Diagnostics go to stderr only.

Requests: `ping`, `chat.send`, `task.start`, `task.approve`, `task.cancel`, `task.diff`,
`task.merge`, `task.discard`.

Events: `pong`, `state`, `token`, `tool_call`, `tool_result`, `approval_request`, `plan`, `todos`,
`verify`, `usage`, `diff`, `worktree`, `done`, `error`.

API keys come in on each request (`provider.apiKey`) from the Keychain. They are never written to
disk and are stripped from traces.

## Modules

| File | Role |
|---|---|
| `loop.ts` | State machine: planning → awaiting_plan_approval → acting ⇄ observing → verifying → done / blocked / cancelled. It enforces max steps, a token budget, cancel and approval waits. Tools go to `streamText` without `execute`, so the harness runs every call itself. |
| `tools/` | `read_file`, `list_dir`, `search` (ripgrep, with a JS fallback), `edit_file` (unique str_replace), `write_file`, `run_command`, `git_status`, `git_diff`, `todo_write`. Each tool has a zod schema, a risk level and a truncator. |
| `policy.ts` | Decides allow / ask / deny. Paths are confined to the project (symlinks and `..` are resolved). Writes inside the worktree are allowed. Commands ask unless allowlisted. sudo, dangerous `rm -r` and `git push` are denied. "Always" choices persist to `<project>/.vard/policy.json`. |
| `context.ts` | Builds the system prompt from the rules, VARD.md/AGENTS.md, the repo map and the todos. Compacts old tool results when over budget. |
| `worktree.ts` | Creates branch `vard/<task>` at `<project>/.vard/worktrees/<task>`, and handles diff, merge and discard. |
| `trace.ts` | Writes every event to `~/.vard/traces/<task>.jsonl` (override with `VARD_TRACE_DIR`). |
| `providers.ts` | Supports anthropic, openai, google, groq, ollama and openai-compatible (OpenRouter). |
| `server.ts` | Request router, shared by both modes. |
| `stdio.ts`, `bin.ts`, `main.ts` | Sidecar loop; the `vard` entry point; a sidecar-only entry for tests. |
| `catalog.ts` | Providers and models, shared with the app (`src/lib/models.ts`). |
| `tui/` | The full-screen UI (Ink + React): `app.tsx` (state, chat and task flows, keyboard), `components.tsx`, `markdown.tsx`, `editor.ts` (prompt editing), `keys.ts` (splits raw key chunks). It reads the keyboard with Bun's stdin stream and hands Ink an idle stand-in, because Ink's own stdin handling misses keys under Bun. `stubs/react-devtools-core` keeps Ink's optional devtools import out of the compiled binary. |
| `cli/` | The CLI: `main.ts` (arguments), `client.ts` (in-process Server), `keys.ts` (env vars, then the app's Keychain items), `render.ts`, `prompt.ts`, `commands/`. |
