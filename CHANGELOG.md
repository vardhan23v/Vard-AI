# Changelog

All notable changes to Vard AI are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Integrations (MCP)** (#8): an MCP client for local (stdio) and remote (Streamable HTTP, bearer or OAuth) servers, an Integrations page, `vard mcp` and `/mcp`. Every external tool call goes through Vard's approvals; secrets live in the Keychain; project configs need trust.
- **Agent skills** (#9): `SKILL.md` skills (built-in, global and per project) with trust, shadowing and ranking per task; a Skills page, a skills picker for new tasks, `vard skills` and `/skills`.
- **Agent teams** (#9): `vard run --team` and the composer's **Team** mode. A planner splits the task, you approve the plan, specialist agents run in parallel in their own worktrees, work is merged with conflict checks and reviewed by a reviewer agent. An Agents dashboard shows the plan graph, agents, approvals and review findings.
- **Code intelligence** (#10): a local tree-sitter index in `.vard/index`, hybrid code search, definitions, references, callers, a dependency graph and impact analysis; read-only `code_*` tools for agents, a Code page, `vard code`, `/code` and `/impact`.
- **Browser testing** (#10): an isolated headless Chromium with page tools, responsive checks across viewports with measured evidence, console and network capture, dev-server management, a Browser page, `vard browser` and `/browser`. In team runs a browser tester checks UI work and sends failures back for fix-and-retest rounds.
- Functional motion and polish on the Code, Browser, Agents and Skills pages (#10).
- `vard run --team --retest-rounds <n>` sets the browser fix-and-retest rounds (0–3, default 2).
- `vard browser origins [--project <dir>] [--remove <origin>]` lists or forgets sites allowed with "always".
- Artifact retention in **Settings → Browser**: keep screenshots and reports forever, or for 7, 30 or 90 days.
- **Settings → Code index**, and **Open in editor** from the Code page.
- Team agents get the codebase overview and the code relevant to their subtask.
- Startup: the window is never blank, a startup splash shows progress, waiting for the session is bounded, and a boot log records startup (#11).
- `CHANGELOG.md`.

### Changed

- The hidden-navigation check also covers links placed directly in a `<header>`.
- Code blocks in chat load only the grammars Vard highlights (via `shiki/core`), and Firebase and React are split into their own vendor chunks, so the web build is much smaller.
- CI also lints the app, typechecks the harness and runs `cargo check --locked`.

### Fixed

- Dev servers are stopped when the agent process is killed, not only on a clean stop (#10).
- The model is told to call tools that need approval instead of asking for permission in text (#10).

## [0.2.0] - 2026-11-18

### Added

- **Project memory** (#7): Vard analyzes each project (stack, commands, conventions, CI) without a model call, recalls the relevant notes before each task, and proposes new notes afterwards. Notes are stored in `<project>/.vard/memory.json` as verified or inferred, with history; anything that looks like a secret is refused. A Memory view in the app, `vard memory` and `/memory`.
- **Website** (#6): a static download site in `site/`, deployed to vard-ai.vercel.app, with the download button, features, the CLI and an FAQ.

### Changed

- The TUI banner adapts to narrow terminal windows and redraws after a resize.
- CI's check job runs on Linux.

### Fixed

- A timed-out command's whole process tree is killed, not only the shell.

## [0.1.0] - 2026-11-18

### Added

- **macOS desktop app** (#1): a Tauri v2 shell with a chat and a coding agent. Tasks are planned, approved, run in their own git worktree with allow/ask/deny approvals, and shown as a diff to merge or discard. API keys stay in the macOS Keychain. Firebase sign-in (Google and email) syncs chats and projects. Universal unsigned DMG built in CI.
- Providers: Anthropic, OpenAI, Google Gemini, OpenRouter and Ollama, bring your own key.
- **`vard` command-line tool** (#3): one binary that is the app's sidecar and the CLI (`ask`, `run`, `keys`, `models`); Groq support, and Groq's free tier as the default.
- **Full-screen terminal UI** (#4): streamed Markdown, tool steps, pop-ups for plan approval, command approval and merging, a status bar, slash-command autocomplete and model and session pickers; `vard --classic` for the line-by-line session.
- README badges (#2).

### Changed

- **Settings → Command-line tool** installs `vard` into a folder on your PATH you can write to, asking for a password only when there is none (#5).

[Unreleased]: https://github.com/vardhan23v/Vard-AI/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/vardhan23v/Vard-AI/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vardhan23v/Vard-AI/releases/tag/v0.1.0
