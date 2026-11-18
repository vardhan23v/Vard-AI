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
| `harness/src/memory.ts` | Project memory (`<project>/.vard/memory.md`): scanner, recall, reflection proposals |
| `firestore.rules` | Security rules; deploy with `bunx firebase-tools deploy --only firestore` |

## Commands

```bash
bun run typecheck             # app types
cd harness && bun test        # harness tests
bun run desktop:dev           # run the app (needs Rust on PATH)
bun run desktop:build         # universal DMG
```

## Rules

- **Keys:** API keys never go to the WebView or into files. They live in the macOS Keychain (service `ai.vard.desktop`), and the Rust shell injects them into sidecar requests. The CLI reads the same items, or env vars.
- **Protocol:** keep `harness/src/protocol.ts` and the UI in step. The UI imports its types.
- **Theme:** use the tokens in `src/styles.css`. Don't hard-code colours.
- **Generated files:** don't edit `src/routeTree.gen.ts` by hand.
- **Secrets:** `.env` holds build-time public config and is git-ignored. Never commit `.env`.
