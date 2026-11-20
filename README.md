<p align="center">
  <img src="public/icon.svg" alt="Vard AI" width="112" />
</p>

<h1 align="center">Vard AI</h1>

<p align="center">
  <a href="https://github.com/vardhan23v/Vard-AI/releases/latest/download/Vard-AI-macOS-universal.dmg"><img alt="Download for macOS" src="https://img.shields.io/badge/Download-macOS-c2b75d?style=for-the-badge&logo=apple&logoColor=1d274e" /></a>
  <a href="https://vard-ai.vercel.app"><img alt="Website" src="https://img.shields.io/badge/Website-vard--ai.vercel.app-30437a?style=for-the-badge&logo=vercel&logoColor=white" /></a>
  <a href="https://github.com/vardhan23v/Vard-AI/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/vardhan23v/Vard-AI?style=for-the-badge&color=1d274e&label=release" /></a>
</p>

<p align="center">
  <a href="https://github.com/vardhan23v/Vard-AI/actions/workflows/desktop.yml"><img alt="Desktop build" src="https://img.shields.io/github/actions/workflow/status/vardhan23v/Vard-AI/desktop.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=build" /></a>
  <img alt="macOS 12+" src="https://img.shields.io/badge/macOS-12%2B-1d274e?style=for-the-badge&logo=apple&logoColor=white" />
  <img alt="Universal" src="https://img.shields.io/badge/Universal-Apple%20Silicon%20%2B%20Intel-30437a?style=for-the-badge" />
  <img alt="CLI" src="https://img.shields.io/badge/CLI-vard-c2b75d?style=for-the-badge&logo=gnubash&logoColor=1d274e" />
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/License-MIT-c2b75d?style=for-the-badge" /></a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-B7410E?style=for-the-badge&logo=rust&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.4-000000?style=for-the-badge&logo=bun&logoColor=white" />
  <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img alt="Firebase" src="https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-DD2C00?style=for-the-badge&logo=firebase&logoColor=white" />
</p>

<p align="center">
  <img alt="Anthropic" src="https://img.shields.io/badge/Anthropic-Claude-191919?style=for-the-badge&logo=anthropic&logoColor=white" />
  <img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-GPT-412991?style=for-the-badge" />
  <img alt="Google Gemini" src="https://img.shields.io/badge/Google-Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white" />
  <img alt="Groq" src="https://img.shields.io/badge/Groq-free%20tier-F55036?style=for-the-badge" />
  <img alt="OpenRouter" src="https://img.shields.io/badge/OpenRouter-models-6566F1?style=for-the-badge&logo=openrouter&logoColor=white" />
  <img alt="Ollama" src="https://img.shields.io/badge/Ollama-local-000000?style=for-the-badge&logo=ollama&logoColor=white" />
</p>

A macOS desktop app that combines a ChatGPT-style **chat** with a Verdent-style **coding agent**. You point the agent at a git project. It plans the work, edits files and runs commands in an isolated worktree, asks before anything risky, and shows you the diff to merge.

Built with Tauri v2, React 19, TanStack Router, Tailwind v4 and shadcn/ui. You bring your own API keys for Groq (free tier), Anthropic, OpenAI, Gemini, OpenRouter or local Ollama.

## Features

**Chat**
- Conversations grouped by date, with search, pin, rename and delete
- Streaming replies with Markdown, tables and highlighted code blocks (copy button)
- Regenerate, edit-and-resend, and stop (Esc)
- Model picker across every provider you have a key for
- Chats sync across your Macs through Firebase

**Coding agent (Projects)**
- Add any git folder, then describe a task
- **Plan first:** review, edit or reject the agent's plan before it touches code
- Every task runs in its own git worktree (`vard/<task-id>` branch), so tasks run in parallel and never touch your working copy
- Live step log of each file read, edit and command, plus a checklist
- **Approvals:** risky commands wait for *Allow once*, *Always allow in this project* or *Deny*
- Optional verify command (for example `bun test`) that runs after edits; failures go back to the agent
- Review the diff, then **Merge**, **Discard** or **Show in Finder**
- **Project memory:** Vard analyzes each project, remembers its stack, commands, conventions, decisions and past fixes, and uses the relevant ones on every task. After a task it suggests new notes; you choose what's saved

**Skills**
- Reusable instructions that teach the agent a kind of task (React, APIs, databases, testing, debugging, code review, security, docs, deployment, MCP servers, accessibility, browser and responsive testing, code search and impact analysis); 20 ship with Vard
- Vard picks the relevant skills for each task and shows which it used; you can also pick them by hand
- Write your own, import them, keep them global or per project. Skills are guidance only: they never skip approvals

**Agent teams**
- Turn on **Team** and a planner splits a bigger task into subtasks for frontend, backend, database and testing agents
- You approve (or edit) the plan; independent subtasks run in parallel, each agent on its own branch with its own skills
- Finished work is merged one subtask at a time with conflict checks, reviewed by a reviewer agent, and shown to you as one diff to merge
- Each agent gets the codebase overview and the code relevant to its subtask
- A live dashboard: plan graph, agent cards, approvals, review findings, pause/resume, retry and cancel

**Code intelligence**
- Vard indexes each project (files, symbols, imports, references) on your Mac and keeps it current as files change
- Search code by what it does ("where is authentication handled?"), find definitions, references and callers, and explore a dependency graph
- Before changing code, agents check what depends on it, which tests cover it and how to verify it; the Code page shows the same impact report
- Open any search result or file from the Code page in your editor

**Browser testing**
- Agents start your dev server and test the app in an isolated headless browser: click, fill forms, take screenshots, and check mobile, tablet and desktop layouts with real measurements
- Console errors and failed requests are captured; screenshots and reports are saved with the task
- In team runs, a browser tester checks UI changes, and failures go back to the developer agents for a limited number of fix-and-retest rounds

**Integrations (MCP)**
- Connect MCP servers, local (stdio) or remote (Streamable HTTP, with bearer or OAuth sign-in), to give the agent new tools, data and prompts
- Every call goes through Vard's approvals, never leaves the project folder, and is clearly marked as coming from an external server

**Command line (`vard`)**
- A full-screen terminal UI: Starry Night banner, streamed Markdown replies, tool steps that tick off, pop-ups for approvals and merging, a status bar (model · branch · tokens), slash-command autocomplete and a model/session picker
- Uses the API keys you saved in the app

**App**
- Sign in with Google or email
- API keys stored in the macOS Keychain
- "Starry Night" theme in dark and light, with three accent colours and a reduced-motion setting

## Install

1. Download **[Vard-AI-macOS-universal.dmg](https://github.com/vardhan23v/Vard-AI/releases/latest/download/Vard-AI-macOS-universal.dmg)** from the [latest release](https://github.com/vardhan23v/Vard-AI/releases/latest) (Apple Silicon and Intel), or from [vard-ai.vercel.app](https://vard-ai.vercel.app).
2. Open it and drag **Vard AI** to Applications.
3. The app isn't notarized yet. On first launch, right-click it in Applications and choose **Open**, then **Open** again.

## Getting started

1. Sign in with Google or email.
2. Open **Settings → API keys** and add a key for at least one provider. The default model, GPT-OSS 120B on Groq, works with a free key from [console.groq.com/keys](https://console.groq.com/keys).
3. **Chats:** start typing.
4. **Projects:** click **Add project folder**, pick a git repository, describe a task and press ⌘↵.

| Shortcut | Action |
|---|---|
| ⌘N | New chat |
| ⌘\ | Show or hide the sidebar |
| ⌘↵ | Start an agent task |
| Enter / Shift+Enter | Send / new line |
| Esc | Stop a streaming reply |

## Command line

Install it from **Settings → Command-line tool → Install** (it links `vard` into a folder on your PATH, such as `~/.local/bin`, pointing at the binary inside the app). Or install it on its own:

```bash
mkdir -p ~/.local/bin && curl -fsSL https://github.com/vardhan23v/Vard-AI/releases/latest/download/vard-macos-universal.gz | gunzip > ~/.local/bin/vard && chmod +x ~/.local/bin/vard
```

Then, in any folder:

```bash
vard                                  # full-screen UI: chat, and /task to run the agent here
vard ask "what does this regex do?"   # one answer
git diff | vard ask "review this"     # piped input is added as context
vard run "add input validation to the signup form" --verify "bun test"
```

| Command | What it does |
|---|---|
| `vard` | Full-screen session. Type to chat; `/task <what to do>` runs the agent in this repo; `/code <query>`, `/impact <file or symbol>` and `/browser` use the code index and test browser; `/team <task>` runs a team (with `/pause`, `/resume`, `/retry <subtask> [note]`, `/continue`); `/skills` lists skills; `/model` and `/sessions` open pickers; `/plan on\|off`, `/diff`, `/merge`, `/discard`, `/keys`, `/clear`, `/help`. `vard -c` continues the last conversation; `vard --classic` is the plain line-by-line version. |
| `vard ask "…"` | One streamed answer |
| `vard run "…"` | Agent task on its own branch: approve the plan and risky commands, then merge, view, discard or keep the diff. Flags: `--no-plan`, `--verify "<cmd>"`, `--no-worktree`, `--max-steps <n>`, `--yes` (scripts). Exit code 0 done, 1 stopped, 2 cancelled. |
| `vard run --team "…"` | A team run: approve the plan, watch each subtask, answer failures (retry with a note, continue, or stop), then merge the combined diff. `--max-agents <n>` (1–6, default 3), `--retest-rounds <n>` (browser fix-and-retest rounds, 0–3, default 2) |
| `vard code [index\|status\|search\|symbols\|def\|refs\|callers\|deps\|dependents\|outline\|impact\|arch\|embeddings\|clean]` | The code index for this repo: `vard code search "where is auth handled"`, `vard code impact verifyToken` |
| `vard browser [status\|install\|test <url>\|artifacts\|clean\|origins]` | The test browser: `vard browser test http://localhost:5173 --viewports mobile,desktop` saves screenshots and a report; exit code 1 if it finds high-severity problems. `clean [--days N]` deletes saved artifacts (only those older than N days with `--days`); `origins [--project <dir>] [--remove <origin>]` lists or forgets the sites you allowed with "always" |
| `vard skills [list\|show\|new\|edit\|import\|validate\|enable\|disable\|rm\|trust\|untrust\|path]` | Manage skills. `vard run --skill <name>` (repeatable) forces a skill; `--no-skills` turns automatic selection off |
| `vard memory [list\|search\|show\|export\|add\|edit\|rm\|verify\|analyze\|rebuild\|clear\|config\|path]` | What Vard remembers about this project (see [Project memory](#project-memory)) |
| `vard mcp [list\|add\|remove\|enable\|disable\|test\|tools\|resources\|prompts\|secret\|trust\|untrust\|import\|permissions\|revoke]` | MCP servers (see [Integrations](#integrations-mcp)) |
| `vard keys [list\|set\|remove] <provider>` | Keys in the Keychain the app also uses |
| `vard models [use <id>]` | List models or set the default |

Options for `vard`, `ask` and `run`: `-m, --model <id>` picks the model (a catalog id from `vard models`, or any id for the provider given with `-p`); `-p, --provider <name>` picks the provider (`anthropic`, `openai`, `google`, `openrouter`, `groq` or `ollama`; on its own it uses that provider's first model, or your default if it's the same provider). Without them, the default from `vard models use` applies.

In the full-screen UI: **Enter** sends, **Ctrl+J** adds a line, **Tab** completes a `/command`, **↑/↓** walk history, **Esc** stops a reply or task (typing a new message while a reply streams interrupts and redirects it), and **Ctrl+C** twice quits.

Keys come from `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY` if set, otherwise from the Keychain. A key saved by an older build of the app may be readable only by the app; save it again with `pbpaste | vard keys set <provider>` to share it. Chat history is in `~/.vard/sessions`, task traces in `~/.vard/traces`.

## Project memory

Vard learns each project and reuses that knowledge on every task, so the agent doesn't rediscover the same things.

**What it knows.** Small facts in categories: project overview, architecture and important files, commands, conventions, your preferences, decisions, solved bugs, known issues and implementation details. Each note records whether it's **verified** (from the project analysis, or confirmed by you) or **inferred** (learned by the agent and not confirmed yet), where it came from, and when it was last updated.

**How it flows:** add a project → analysis → before a task, recall → plan → your approval → work → verify → learn.

- **Analysis** happens when you add a project (or on the first task, or *Re-analyze*). It reads only git-tracked files and small, known config and doc files, with no model call. It covers stack, package manager, scripts and test commands, frameworks, entry points, folders, configs, CI and the README.
- **Recall:** before each task, the notes most related to the request (plus the overview) go into the agent's context, within a size you control. Inferred notes are labelled as unconfirmed.
- **Learning:** after a successful task, the agent proposes durable facts. It skips task-specific narration, duplicates and anything that looks like a secret. A note that contradicts an older one becomes an update, and the old note is kept as history.
- **Updates after tasks:** *Ask me* (default: you choose what's saved, as verified), *Automatic* (saved as inferred, and it never overwrites a verified note), or *Off*.

**Privacy and safety.** Memory is a local JSON file, `<project>/.vard/memory.json` (`.vard/` is git-ignored). Analysis respects `.gitignore` and your excluded paths, and never reads `.env` files, keys, certificates or credential files. Notes that look like API keys, tokens, passwords or private keys are refused, whether you type them or the agent proposes them.

| Where | How |
|---|---|
| App | Project page → brain icon: search, filter, edit, verify, delete, add notes, re-analyze, clear, replaced-notes history, and settings (on/off, use in tasks, updates after tasks, context size, excluded paths). A finished task shows "Using N project notes" and the suggested notes |
| TUI | `/memory`, `/memory search <q>`, `/memory analyze`; a "Remember for next time?" checklist after tasks; `memory N` in the status bar |
| CLI | `vard memory list [--category c] [--search q]`, `search`, `show` (or `export`: all notes as Markdown), `add <category> <text>`, `edit <id>`, `rm <id>`, `verify <id>`, `analyze` (or `rebuild`), `clear`, `config [key value]`, `path` (where the file is); `vard run --no-memory` and `--remember` |

## Skills

A skill is a folder with a `SKILL.md`: YAML frontmatter, then Markdown instructions. It can also have `references/` (read on request), `scripts/` and `assets/`.

```markdown
---
name: react-development
description: Build and maintain production-ready React applications.
version: 1.0.0
tags: [react, frontend, typescript]
triggers: [react, component, hook]   # words in a task that make it relevant
globs: ["**/*.tsx"]                  # files that make it relevant for a repo
roles: [frontend]                    # agent roles it suits
scripts:
  - name: lint
    file: scripts/lint.sh
---

# React development
## Instructions
- Follow existing project conventions.
```

- **Where they live:** built-in (20, inside the app), global (`~/.vard/skills/<name>/`) and per project (`<project>/.vard/skills/<name>/`). A project or global skill can't replace one with the same name from a higher source (built-in › global › project); it's shown as *shadowed* instead.
- **How they're chosen:** for each task (or each agent of a team), skills are ranked by the task's words against their name, tags, triggers and description, the project's files and dependencies, and the agent's role. Only the top few, within a size limit, go into the agent's context, and the task view shows which ones and why. You can force skills per task.
- **Safety:** skill text is treated as untrusted guidance below Vard's own rules; it can't grant permissions or skip approvals. Paths are checked to stay inside the skill folder (no `..`, absolute paths or escaping symlinks). Scripts run only through `skill_run_script`, which asks you every time ("always" is never offered) and gets a clean environment. Skills that contain anything that looks like a credential are rejected. Project skills are used only after you **trust** that exact content; imported skills start turned off.
- **Manage them:** the **Skills** page (search, filter by source, details, what the agent sees, resources, usage history, create, edit with live validation, import, enable, delete, trust), `vard skills …`, or `/skills` in the TUI.

## Agent teams

Turn on **Team** when starting a task (or `vard run --team`). The run works like this:

1. A **planner** agent inspects the project (read-only) and returns a task graph: subtasks for the frontend, backend, database and testing roles, with dependencies and the files each expects to touch. Duplicate subtasks are merged, and subtasks that touch the same files are ordered one after the other.
2. You **approve** the plan, or edit titles, instructions and roles, remove subtasks, or ask for a new plan.
3. Independent subtasks run **in parallel** (up to 3 at once by default, at most 6). Each agent is the normal Vard agent loop with its role's tools, its own skills, the project's memory notes relevant to its assignment, the codebase overview and the code most relevant to its subtask (from the code index), and the approved MCP tools. It works in **its own worktree**, branched from the run's integration branch, so it sees the work of the subtasks it depends on.
4. When an agent finishes, its work is committed, checked for conflicts with `git merge-tree`, and merged into the integration branch one subtask at a time. A conflict is never forced: the subtask is retried on top of the latest work, or waits for you.
5. **Browser checks:** for UI work the planner adds a browser-testing subtask. If the check fails (medium or worse findings), fix subtasks go to the agents whose code is responsible and the check runs again, up to 2 rounds by default (`team.retestRounds` or `vard run --team --retest-rounds <n>`, 0–3).
6. A **reviewer** agent reads the combined diff (and the verify command's result, if set) and reports findings. If it requests changes, one round of fix subtasks runs and it reviews again.
7. You review the **combined diff** and merge or discard it, exactly like a normal task.

Every tool call still goes through the policy and your approvals; approvals show which agent is asking. Subtasks have time limits, a retry, and failure isolation (a failure only blocks what depends on it). You can pause (agents stop at their next step), resume, cancel or retry a subtask with a note (or an answer, if the agent asked a question), and continue without failed subtasks. Token use is shown as the providers report it; there's a budget for the whole run and per agent.

**Rate limits.** Every agent calls the model, so a team uses several times the tokens of a single task, and parallel agents share your provider's rate limit. On Groq's free tier (8,000 tokens per minute for GPT-OSS 120B), agents spend most of their time waiting and can hit their time limit. A live test there completed the code subtasks but timed out on tests and fixes. Use a paid tier, a provider with higher limits, or `--max-agents 1`. Rate-limit waits are shown per agent.

**Roles:** planner, frontend, backend, database, testing, browser (tests in the browser and never edits files), analyst (maps code and impact and never edits) and reviewer. Configure them in Agents page → Roles, or `~/.vard/agents.json`: give a role its own model (it uses that provider's saved key), preferred skills, a step limit and extra instructions. Tool access can only be narrowed: the reviewer and planner never edit files.

## Code intelligence

Vard keeps an index of each project so agents (and you) can find the right code and see what a change affects.

- **What's indexed:** TypeScript, TSX, JavaScript/JSX, Rust, Python, Go, Java and C/C++ are parsed with [tree-sitter](https://tree-sitter.github.io) (grammars built into Vard). Vard extracts classes, functions, methods, types, variables, imports, exports, call and type references, plus JSON keys, `package.json` dependencies and Markdown headings. Imports resolve through relative paths, `tsconfig` paths, index files, Python packages, Rust modules, Go packages, Java imports and C includes.
- **What's skipped:** anything `.gitignore` ignores, dependencies and build output (`node_modules`, `dist`, `target`, …), lockfiles, binaries, files over 1 MB, `.env` and credential files, and any folders you exclude.
- **Where:** `<project>/.vard/index/` (SQLite), separate from project memory. Only changed files are re-parsed, and an index that can't be read is rebuilt. Indexing Vite (2,200 indexable files) takes about 3 seconds and makes a 15 MB index. An update with no changes takes 60 ms.
- **Search** combines keyword matches (weighted by how rare each word is), symbol names, file paths and import-graph neighbours, and shows why each result matched. **Vector search is optional and off by default:** you can turn it on with a local Ollama embedding model you already have, or with your OpenAI or Google key. Vard never downloads a model, and code that looks like it contains secrets is never sent.
- **Impact analysis** reports direct and indirect dependents, references, the public API involved, related tests, config files and verification commands. Its risk level is computed from the counts, which are shown. References and callers are matched by name through imports, so they are best effort in dynamic code.
- **In tasks** the agent gets a short codebase overview and read-only `code_*` tools. In team runs the planner runs impact analysis before splitting the work, and each agent gets the overview plus the code relevant to its subtask.
- **Code page:** status and progress, build or delete the index, search, symbols, a file's outline and dependencies, an interactive dependency graph (capped so it stays readable), impact reports, exclusions and embedding settings. **Open in editor** opens a result or file at its line in your editor.
- **Settings → Code index:** the same index settings in one place.

## Browser testing

Agents can test your app in a real browser:

1. **Start the dev server.** The agent finds the dev command (`dev_server_detect`) and starts it on a free port. It runs in the agent's own worktree, with your approval like any command, without your API keys in its environment. It stops when the task ends.
2. **Open the page** in an isolated headless Chromium and interact through the accessibility tree: roles and names, labels and text, with CSS selectors only as a last resort.
3. **Test viewports:** mobile 375×812, mobile-large 430×932, tablet 768×1024, laptop 1366×768 and desktop 1920×1080, or a custom size. Each problem reported comes from a measurement in the page, with the element and the numbers: sideways scrolling, clipped text, controls covered or off screen, tap targets under 24 px, fields without labels, broken images, navigation hidden with no menu button (links in a `<nav>` or straight in a `<header>`).
4. **Collect errors:** console errors and warnings, uncaught exceptions, failed requests and 4xx/5xx responses. Sensitive URL parameters are redacted; headers, cookies and bodies are never kept.
5. **Report:** screenshots and a JSON and Markdown report go to `<project>/.vard/artifacts/<task>/`. Vision-capable models also get the screenshots as images; others work from the measurements.

**Getting a browser.** Vard uses a Chromium already on your Mac: Playwright's browser cache, or Chrome, Edge, Brave or Chromium in `/Applications`. If there's none, **Browser → Install browser** (or `vard browser install`) downloads Playwright's Chrome Headless Shell (about 90 MB) into Playwright's cache folder, `~/Library/Caches/ms-playwright`. Nothing is bundled with the app. Set `VARD_CHROMIUM` to use a specific executable.

**Safety:**
- **Isolation:** each task (and each team agent) gets its own browser context, with a fresh profile, no shared cookies or storage, downloads off, service workers blocked and dialogs dismissed. It never uses your own browser profile.
- **Where it can go:** only this Mac's servers (`localhost`, `127.0.0.1`, `*.localhost`). Other sites ask first, and "always" remembers that origin for the project. `file:`, `chrome:` and the like are refused. Links and redirects can't leave the allowed sites either, because the check happens at the network layer.
- **Sensitive actions:** clicks and typing that look like paying, buying, transferring money, deleting an account, deploying or entering a password are refused unless the agent marks them sensitive. Then you're asked every time.
- **Untrusted content:** page content is passed to the model wrapped as untrusted data, and the agent is told never to follow instructions in it.

**Cost:** browser tools add about 3,000 tokens to each model call, so they're offered only when a task is about pages, layout or UI (or you turn them on), and to team roles that need them.

**Browser page:** which Chromium is used, live sessions (address bar, back, reload, viewport, screenshot, stop), a screenshot gallery, console, network, report and activity, dev servers, and saved artifacts per project.

**Artifacts and remembered sites.** **Settings → Browser** sets how long screenshots and reports are kept: forever (the default), 7, 30 or 90 days. You can also use **Delete all**, or `vard browser clean [--days N]` (with `--days`, only artifacts older than N days). Sites you allowed with "always" are listed by `vard browser origins [--project <dir>]`; `--remove <origin>` forgets one.

## Integrations (MCP)

Vard is an [MCP](https://modelcontextprotocol.io) client, built on the official TypeScript SDK and protocol `2025-11-25`. Open **Integrations** in the rail:

- **Add a server.**
  - **Local:** a command, arguments, a working folder and only the environment variables you list.
  - **Remote:** a URL with bearer-token or OAuth sign-in.
  - **Test connection** shows the protocol version, capabilities and what the server offers.
  - **Import** brings in servers from Claude Desktop, Cursor, Windsurf or VS Code. Imported servers start disabled.
- **Inspect it:** tabs for Overview, Tools (descriptions, input schemas, per-tool on/off), Resources (browse and read), Prompts (fill in, then *Use in a new chat*), Permissions and Logs.
- **Use it:** connected servers' tools join the agent's tools for every task in that project, through the same plan → approval → execution → verification loop. The task view shows the server, tool, input, status and output of each MCP call.

**Security model:**
- **Approvals:** every MCP tool **asks** by default. Per project you can *Allow once*, *Always allow this tool*, or *Deny*, and revoke at any time. Tools the server marks destructive ask **every time**. Server hints only ever make Vard stricter.
- **Sandbox:** arguments that point outside the project or the task's worktree are refused. Servers only see the project and the worktree as MCP roots.
- **Untrusted output:** tool and resource output is wrapped and labelled as untrusted data, and the agent is told never to follow instructions inside it. Tool descriptions are cleaned and labelled as unverified.
- **Secrets:** env secrets, headers, bearer tokens and OAuth tokens live in the macOS Keychain (service `ai.vard.mcp`). They never appear in config files, the UI, task traces, logs (masked) or the model's context. Local servers get a minimal environment plus only the variables you configure.
- **Remote URLs:** https only (http only to this Mac), no credentials in URLs, no link-local or cloud-metadata addresses. A project's config can't target private networks.
- **Project configs:** a project can ship its own `.vard/mcp.json`, but it starts nothing until you **trust** it, and any change needs trust again. Global servers live in `~/.vard/mcp.json`.

CLI: `vard mcp list | add | remove | enable | disable | test | tools | resources | prompts | secret | trust | untrust | import | permissions | revoke`. TUI: `/mcp`.

```bash
vard mcp add everything -- npx -y @modelcontextprotocol/server-everything
vard mcp test everything
vard run "use the everything server's add tool to add 2 and 3"
```

## Architecture

```
Tauri shell (Rust, src-tauri/)
 ├─ window, folder picker, macOS Keychain for API keys
 ├─ spawns + supervises the sidecar: `vard agent --stdio`
 └─ WebView: React SPA (src/)  ⇄  sidecar via JSON-lines over stdio
`vard` (TypeScript, harness/, compiled with `bun build --compile`)
 ├─ `agent --stdio`: the app's sidecar
 ├─ otherwise: the command-line tool (harness/src/cli/), same harness in-process
 ├─ providers: Vercel AI SDK (Groq, Anthropic, OpenAI, Google, OpenRouter, Ollama)
 ├─ chat runner (streaming) + agent harness (loop, tools, policy, worktrees, traces, memory)
 ├─ MCP client (harness/src/mcp): stdio + Streamable HTTP servers, tools/resources/prompts
 ├─ skills (harness/src/skills): discovery, trust, ranking, prompt section, skill tools
 ├─ teams (harness/src/agents): planner, scheduler, workers, integrator, reviewer
 ├─ code intelligence (harness/src/intelligence): tree-sitter parsing, SQLite index, search, graph, impact
 ├─ browser agent (harness/src/browser): playwright-core sessions, page tools, responsive checks, dev servers
 └─ local tools: files, search, edit, shell commands, git
Firebase: sign-in (email + Google) and Firestore sync of chats, projects and task summaries
```

- **Keys never reach the WebView.** The Rust shell reads them from the Keychain and adds them to each sidecar request (`src-tauri/src/lib.rs`).
- **The agent harness is code, not a prompt.**
  - `harness/src/loop.ts`: plan → approve → act → observe → verify state machine
  - `harness/src/policy.ts`: allow / ask / deny rules, path sandbox, command allowlist
  - `harness/src/worktree.ts`: one git worktree per task (and per agent in a team run)
  - `harness/src/agents/orchestrator.ts`: team runs, built on the same loop, policy and worktrees
  - `harness/src/trace.ts`: a JSONL trace per task in `~/.vard/traces`
  - `harness/src/protocol.ts`: the typed protocol shared with the UI
- **The protocol is shared.** `src/lib/agent-client.ts` imports its types from `harness/src/protocol.ts`.

## Develop

Requirements: macOS 12+, [Bun](https://bun.sh) 1.4+, Rust (stable), and Xcode Command Line Tools.

```bash
bun install
(cd harness && bun install)
cp .env.example .env   # fill in the Firebase web config and Google desktop client
bun run desktop:dev    # builds the sidecar, then starts Tauri with hot reload
```

If you installed Rust with Homebrew's `rustup`, put it on your PATH:

```bash
export PATH="$(brew --prefix rustup)/bin:$PATH"
```

| Command | What it does |
|---|---|
| `bun run dev` | Web UI only, at http://localhost:1420 (no agent; replies need the desktop app) |
| `bun run desktop:dev` | Full desktop app in development |
| `bun run build:agent` | Compile `harness/` to `src-tauri/binaries/vard-<triple>` (sidecar and CLI) |
| `bun run desktop:build` | Universal (Apple Silicon + Intel) `.dmg` |
| `bun run build` | Build the web UI into `dist/` |
| `bun run typecheck` | Typecheck the app |
| `bun run lint` | ESLint and Prettier for the app |
| `cd harness && bunx tsc --noEmit` | Typecheck the harness |
| `cd harness && bun test` | Harness, loop and CLI tests |
| `bun harness/src/bin.ts` | Run the CLI from source |

The DMG ends up in `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`.

## Firebase

- **Project:** `vard-ai-7f1054` (see `.firebaserc`).
- **Data:** every document lives under `users/{uid}/…`:
  - `conversations/{id}/messages/{id}`
  - `projects/{id}/tasks/{id}`
- **Rules:** [`firestore.rules`](firestore.rules) limits each user to their own data. Deploy them with:

```bash
bunx firebase-tools deploy --only firestore
```

- **Sign-in:** email/password and Google, both enabled under Authentication → Sign-in method.
- **Google in the desktop app:** uses a Google OAuth client of type **Desktop app** in the same Google Cloud project, set through `VITE_GOOGLE_DESKTOP_CLIENT_ID` and `VITE_GOOGLE_DESKTOP_CLIENT_SECRET`. The Rust shell runs the browser sign-in with PKCE and a loopback redirect to `127.0.0.1:47823`, then signs in to Firebase with Google's ID token.
- **Not synced:** project folder paths stay on each Mac.

## Troubleshooting

| Problem | Fix |
|---|---|
| "No … API key saved" | Add the key in **Settings → API keys**. Keys saved by other tools aren't readable by the app. |
| macOS asks for Keychain access | Enter your password and choose **Always Allow**. Unsigned development builds can ask again after a rebuild. |
| OpenRouter 404, "guardrail restrictions" or "ZDR violation" | Your OpenRouter privacy settings block that model. Allow it, or use Groq. |
| 429 (rate-limited) | Free tiers have per-minute limits. The agent waits and retries. |
| "Sign-in isn't set up" | Enable Authentication and its Email and Google providers in the Firebase console. |
| Google says "access blocked" | Add your account as a test user on the OAuth consent screen, or publish the app. |

## Distribution

Builds are **unsigned** (ad-hoc signature) for now. On first launch, right-click the app and choose **Open**. Signing and notarization need an Apple Developer ID; add them in `src-tauri/tauri.conf.json` (`bundle.macOS.signingIdentity`) and the CI workflow.

CI (`.github/workflows/desktop.yml`) typechecks the app and the harness, lints the app, runs the harness tests, runs `cargo check --locked` and uploads a universal DMG and the standalone `vard` binary as build artifacts. It needs the six variables in `.env.example` as repository secrets.

## Website

The download site lives in [`site/`](site) (static HTML, CSS and JS) and deploys to [vard-ai.vercel.app](https://vard-ai.vercel.app) from `main` via Vercel. Its download buttons point to `releases/latest/download/…`, so publishing a release with the same asset names (`Vard-AI-macOS-universal.dmg`, `vard-macos-universal.gz`) updates them.

## License

MIT
