# Vard AI

Vard AI is a personal, voice-first AI assistant inspired by the cinematic feel of Jarvis and the everyday utility of Siri. Built with **TanStack Start**, **React 19**, **TypeScript**, and **Tailwind CSS v4**, it delivers a fast, immersive chat experience with persistent memory, custom branding, and a modular tool system.

> **Live preview:** [https://id-preview--bb13927f-f260-4c47-a5d2-192e5c2dcd9a.lovable.app](https://id-preview--bb13927f-f260-4c47-a5d2-192e5c2dcd9a.lovable.app)  
> **Published site:** [https://vard-ai.lovable.app](https://vard-ai.lovable.app)  
> **GitHub repo:** [https://github.com/vardhan23v/Vard-AI.git](https://github.com/vardhan23v/Vard-AI.git)


---

## What is Vard AI?

Vard (Voice-Activated Responsive Director) is designed to feel less like software and more like a companion. It combines:

- **Natural voice input** — real-time transcription and spoken-style replies.
- **Streaming AI chat** — powered by Groq (`llama-3.3-70b-versatile`) for fast, token-by-token responses.
- **Persistent memory** — remembers facts, preferences, and people across conversations.
- **Customizable brand & motion** — switch themes, accents, logos, and route transitions.
- **Reduced-motion support** — fully accessible animation controls and system preference detection.
- **MCP tool system** — extensible agent integrations via the Model Context Protocol.

---

## Features

### Core Assistant
- Text and voice chat with a cinematic orb avatar.
- Live streaming response with percentage progress and stop/cancel controls.
- Escape-key shortcut and on-screen buttons to abort generation.
- Regenerate last prompt per thread, persisted across refresh.

### Theming & Branding
- Dark/light/system mode with multiple accent palettes (Mint, Violet, Coral, Cyan, Amber).
- Brand customization panel: logo upload with cropping, app name, accent color, and background style.
- Background styles: Nebula, Aurora, Mesh, Grid, Gradient, and more.
- Motion customization: duration, easing, and transition presets (fade, slide, zoom, blur, lift).

### Accessibility
- Reduced-motion toggle with live preview.
- Spinner, shimmer, toast, modal, and route-transition animations all respect the setting.
- Automated Playwright regression tests for full vs. reduced motion.

### Architecture
- **TanStack Start v1** full-stack React framework.
- **Server functions** and API routes for backend logic.
- **Supabase** integration for authentication and secure sessions.
- **Lovable AI Gateway** for transcription and optional AI features.
- **MCP server** with OAuth-protected tools (`echo`, `whoami`, extensible).

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start v1 |
| UI | React 19, TypeScript |
| Styling | Tailwind CSS v4, CSS custom properties |
| Icons | Lucide React |
| Auth | Supabase Auth |
| AI / Voice | Groq API, Lovable AI Gateway |
| Tools | Model Context Protocol (MCP) |
| Testing | Playwright |

---

## Project Structure

```text
src/
  components/        # Reusable UI components (Sidebar, JarvisOrb, ChatWindow, etc.)
  hooks/             # Custom React hooks
  integrations/      # Supabase clients and auth middleware
  lib/               # Utilities, theme, brand, motion, voice input, MCP tools
  routes/            # TanStack file-based routes
  server.ts          # Server entry configuration
  start.ts           # Start instance with auth middleware
  styles.css         # Global theme variables and animations
supabase/            # Supabase configuration
.github/workflows/    # CI workflows (reduced-motion regression tests)
```

---

## Getting Started

### Prerequisites

- Node.js (recommended via [nvm](https://github.com/nvm-sh/nvm))
- A package manager: `npm`, `yarn`, `pnpm`, or `bun`

### Install

```sh
git clone <repository-url>
cd <repository-name>
npm install
```

### Environment Variables

Create a `.env` file in the project root with at least:

```env
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
GROQ_API_KEY=<your-groq-api-key>
LOVABLE_API_KEY=<your-lovable-api-key>
```

> Backend secrets (`GROQ_API_KEY`, `LOVABLE_API_KEY`) are read server-side only via `process.env` in server functions and API routes.

### Run Locally

```sh
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## Available Routes

| Route | Description |
| --- | --- |
| `/` | Landing page with hero and feature overview |
| `/login` | Authentication entry point |
| `/dashboard` | Main dashboard with bento-grid layout |
| `/dashboard/chat` | AI chat interface |
| `/dashboard/agents` | Agent builder |
| `/memory` | Persistent memory management |
| `/automations` | Recurring routines and triggers |
| `/integrations` | Connected services and MCP tools |
| `/personality` | Assistant personality settings |
| `/history` | Conversation history |
| `/analytics` | Usage analytics |
| `/documents` | Document library |
| `/voice` | Voice and avatar settings |
| `/shortcuts` | Keyboard shortcuts |
| `/settings` | App settings, theme, motion, brand |
| `/about` | About Vard AI |

---

## Voice & Chat

Voice input is captured via the browser microphone, sent to `/api/transcribe`, and transcribed through the Lovable AI Gateway. The chat endpoint at `/api/chat` streams responses from Groq in real time. Both endpoints require an authenticated Supabase session.

---

## Customization

Open the **Brand Panel** in the app to customize:

- Logo (upload + crop)
- App name
- Accent color
- Background style
- Route transition preset
- Motion intensity and reduced-motion preference

---

## Accessibility

Vard AI is built with accessibility in mind:

- Respects `prefers-reduced-motion`.
- Progress indicators expose `role="progressbar"` and ARIA labels.
- Focus states and keyboard shortcuts are supported.
- Reduced-motion regression tests run in CI.

---

## Testing

Run the Playwright test suite:

```sh
npx playwright test
```

Key test files:

- `tests/reduced-motion.spec.ts` — verifies reduced-motion behavior across the app.
- `tests/reduced-motion-visual.spec.ts` — screenshot comparison of full vs. reduced motion.
- `tests/reduced-motion-audit.spec.ts` — validates transition durations under reduced motion.

---

## Deployment

### Sync from Lovable to GitHub

This project is developed in [Lovable](https://lovable.dev). To push it to your GitHub repo (`https://github.com/vardhan23v/Vard-AI.git`):

1. Open the Lovable editor.
2. Click the **+ (Plus)** menu in the chat input (bottom left).
3. Select **GitHub → Connect project**.
4. Authorize the Lovable GitHub App.
5. Choose your GitHub account/organization.
6. Click **Create Repository** — Lovable will create a new repo and push the current project code.

> **Note:** Lovable always creates a **new** repository. It cannot overwrite or merge directly into the existing `Vard-AI` Turbo monorepo. After the new repo is created, you can either keep it separate or merge it into the existing monorepo manually.

### Merge into the existing `Vard-AI` monorepo

If you want this Lovable project inside your existing Turbo repo:

1. Clone the new repo Lovable created.
2. Copy its contents into a new folder inside `Vard-AI`, e.g. `apps/vard-ai-lovable`.
3. Add the new folder to your root `pnpm-workspace.yaml`:
   ```yaml
   packages:
     - 'apps/*'
     - 'packages/*'
   ```
4. Run `pnpm install` from the monorepo root.
5. Commit and push to `Vard-AI`.

### Self-hosting

The TanStack Start output can be deployed to any platform that supports Vite 7 + edge/serverless runtimes. Environment variables for backend secrets must be configured in the hosting environment.


---

## License

This project is built and owned by the creator. All rights reserved.

---

## About

**Vard AI** is a personal AI assistant project focused on speed, memory, presence, and privacy. It aims to blend the cinematic personality of Jarvis with the practical accessibility of Siri, while giving the owner full control over branding, motion, and data.

Built with care using Lovable, TanStack Start, and Supabase.
