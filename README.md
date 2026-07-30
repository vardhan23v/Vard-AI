# 🤖 Vard AI

**Vard AI** (Voice-Activated Responsive Director) is a personal, voice-first AI assistant inspired by the cinematic feel of Jarvis and the everyday utility of Siri. Built with **TanStack Start**, **React 19**, **TypeScript**, and **Tailwind CSS v4**, it delivers a fast, immersive chat experience with persistent memory, custom branding, streaming AI responses, and a modular MCP tool system.

> **Live preview:** [id-preview.lovable.app](https://id-preview--bb13927f-f260-4c47-a5d2-192e5c2dcd9a.lovable.app)
> **Published site:** [vard-ai.lovable.app](https://vard-ai.lovable.app)
> **GitHub repo:** [github.com/vardhan23v/Vard-AI](https://github.com/vardhan23v/Vard-AI)

[![TanStack Start](https://img.shields.io/badge/TanStack_Start-v1-FF4154?style=for-the-badge&logo=react&logoColor=white)](https://tanstack.com/start)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Groq](https://img.shields.io/badge/Groq-Llama_3.3-f97316?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

---

## 🧠 What is Vard AI?

Vard is designed to feel less like software and more like a companion. It combines:

- **Natural voice input** — real-time browser microphone capture with WAV encoding and streaming transcription via the Lovable AI Gateway.
- **Streaming AI chat** — powered by Groq (`llama-3.3-70b-versatile`) for fast, token-by-token responses with stop/cancel controls.
- **Persistent memory** — remembers facts, preferences, and people across conversations.
- **Customizable brand & motion** — switch themes, accents, logos, background styles, and route transitions.
- **Reduced-motion support** — fully accessible animation controls with system preference detection and automated Playwright regression tests.
- **MCP tool system** — extensible agent integrations via the Model Context Protocol with OAuth-protected tools.

---

## 🚀 Features

### 🎙️ Voice & Chat
- **Voice Input**: Click the mic, speak naturally — audio is captured via the browser, encoded to WAV (16kHz mono PCM), and streamed to `/api/transcribe` for real-time transcription.
- **Streaming Responses**: Chat endpoint at `/api/chat` streams Groq responses token-by-token with live progress and stop/cancel controls.
- **Escape Key Abort**: Press Escape or click the stop button to cancel generation mid-stream.
- **Regenerate**: Regenerate the last prompt per thread, persisted across page refresh.
- **Command Bar**: Floating command bar with `/` shortcuts, voice toggle, and keyboard navigation (`⌘K`).

### 🎨 Theming & Branding
- **Dark/Light/System Mode**: Full theme support with CSS custom properties.
- **Accent Palettes**: Mint, Violet, Coral, Cyan, Amber — change the entire app's accent color.
- **Brand Panel**: Upload and crop a custom logo, rename the app, pick accent colors, and choose background styles.
- **Background Styles**: Nebula, Aurora, Mesh, Grid, Gradient, and more.
- **Motion Customization**: Duration, easing, and transition presets (fade, slide, zoom, blur, lift).

### 🏠 Dashboard
- **Bento Grid Layout**: Cinematic dashboard with ambient aurora backdrops, animated orb, and system status indicators.
- **Today's Agenda**: Quick-view agenda panel with color-coded items.
- **Quick Actions**: One-click actions for Draft Email, Schedule, and Analyze Data.
- **Pending Actions Counter**: At-a-glance task count with animated stats.

### ♿ Accessibility
- **Reduced Motion Toggle**: Live preview of reduced vs. full motion.
- **ARIA Support**: Progress indicators expose `role="progressbar"` and ARIA labels.
- **Focus States & Keyboard Shortcuts**: Full keyboard navigation support.
- **CI Regression Tests**: Automated Playwright tests for reduced-motion compliance.

### 🔧 MCP Tool System
- **Model Context Protocol**: OAuth-protected MCP server with extensible tools.
- **Built-in Tools**: `echo` (connectivity check) and `whoami` (user identity).
- **Granular Consent**: Per-tool OAuth consent flow via Supabase auth.

### 🔐 Authentication
- **Supabase Auth**: Full sign-up/login with email/password.
- **Session Management**: Secure sessions with server-side auth middleware.
- **Protected Routes**: All dashboard and API routes require authentication.

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | TanStack Start v1 (full-stack React) |
| **UI** | React 19, TypeScript |
| **Styling** | Tailwind CSS v4, CSS custom properties |
| **Icons** | Lucide React |
| **Auth** | Supabase Auth |
| **AI / Chat** | Groq API (Llama 3.3 70B Versatile) |
| **Voice / Transcription** | Lovable AI Gateway |
| **Tools** | Model Context Protocol (MCP) |
| **Testing** | Playwright (E2E + reduced-motion regression) |
| **Package Manager** | Bun |

---

## 📊 Architecture

```
Browser (Voice/Text Input)
    │
    ├── /api/chat (POST) ──────► Groq API (llama-3.3-70b-versatile)
    │       Streaming SSE ──────► Token-by-token response
    │
    ├── /api/transcribe (POST) ─► Lovable AI Gateway
    │       Streaming SSE ──────► Real-time transcript
    │
    └── /.mcp/* ───────────────► MCP Server (OAuth-protected tools)
            echo, whoami, extensible
```

---

## 📁 Project Structure

```
Vard-AI/
├── src/
│   ├── components/
│   │   ├── BrandPanel.tsx           # Logo upload, app name, accent, background
│   │   ├── JarvisOrb.tsx            # Cinematic animated orb avatar
│   │   ├── LogoCropper.tsx          # Logo crop tool
│   │   ├── Sidebar.tsx              # Navigation sidebar
│   │   ├── ThemeSwitcher.tsx        # Dark/light/system toggle
│   │   ├── agents/
│   │   │   └── VisualBuilder.tsx    # Agent builder interface
│   │   ├── chat/
│   │   │   ├── ChatPrompt.tsx       # Chat input with voice toggle
│   │   │   └── ChatWindow.tsx       # Full chat interface with streaming
│   │   └── ui/                      # 40+ shadcn/ui components
│   ├── hooks/
│   │   └── use-mobile.tsx           # Mobile detection hook
│   ├── integrations/
│   │   └── supabase/                # Supabase client, auth middleware, types
│   ├── lib/
│   │   ├── brand.tsx                # Brand customization context
│   │   ├── motion.tsx               # Motion presets & reduced-motion
│   │   ├── theme.tsx                # Theme provider & accent palettes
│   │   ├── voice-input.ts           # Browser mic → WAV → transcription
│   │   ├── utils.ts                 # Shared utilities
│   │   ├── require-auth.server.ts   # Server-side auth guard
│   │   └── mcp/
│   │       ├── index.ts             # MCP server definition
│   │       └── tools/
│   │           ├── echo.ts          # Connectivity check tool
│   │           └── whoami.ts        # User identity tool
│   ├── routes/
│   │   ├── __root.tsx               # Root layout with providers
│   │   ├── index.tsx                # Landing page (hero, features, orb)
│   │   ├── login.tsx                # Auth entry point
│   │   ├── dashboard.tsx            # Dashboard layout
│   │   ├── dashboard.index.tsx      # Dashboard home (bento grid)
│   │   ├── dashboard.chat.tsx       # AI chat interface
│   │   ├── dashboard.agents.tsx     # Agent builder
│   │   ├── memory.tsx               # Persistent memory management
│   │   ├── automations.tsx          # Recurring routines & triggers
│   │   ├── integrations.tsx         # Connected services & MCP tools
│   │   ├── personality.tsx          # Assistant personality settings
│   │   ├── history.tsx              # Conversation history
│   │   ├── analytics.tsx            # Usage analytics
│   │   ├── documents.tsx            # Document library
│   │   ├── voice.tsx                # Voice & avatar settings
│   │   ├── shortcuts.tsx            # Keyboard shortcuts
│   │   ├── settings.tsx             # App settings, theme, motion, brand
│   │   ├── about.tsx                # About Vard AI
│   │   ├── library.tsx              # Content library
│   │   ├── api/
│   │   │   ├── chat.ts              # Groq streaming chat endpoint
│   │   │   └── transcribe.ts        # Voice transcription endpoint
│   │   └── [.mcp]/                  # MCP OAuth & tool endpoints
│   ├── server.ts                    # Server entry configuration
│   ├── start.ts                     # Start instance with auth middleware
│   └── styles.css                   # Global theme variables & animations
├── supabase/                        # Supabase configuration
├── tests/                           # Playwright E2E & regression tests
├── .github/workflows/               # CI (reduced-motion regression)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 🗺️ Available Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page with hero, animated orb, and feature cards |
| `/login` | Authentication entry point |
| `/dashboard` | Main dashboard with bento-grid layout |
| `/dashboard/chat` | AI chat interface with streaming responses |
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
| `/library` | Content library |

---

## ⚙️ Getting Started

### Prerequisites

- Node.js (v18+) — recommended via [nvm](https://github.com/nvm-sh/nvm)
- A package manager: `npm`, `yarn`, `pnpm`, or `bun`
- Supabase project (for auth)
- Groq API key ([get one free](https://console.groq.com/keys))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/vardhan23v/Vard-AI.git
   cd Vard-AI
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or: bun install
   ```

3. **Configure environment variables**

   Create a `.env` file in the project root:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   VITE_SUPABASE_PROJECT_ID=your_supabase_project_id
   GROQ_API_KEY=your_groq_api_key
   LOVABLE_API_KEY=your_lovable_api_key
   ```

   > Backend secrets (`GROQ_API_KEY`, `LOVABLE_API_KEY`) are read server-side only via `process.env` in server functions and API routes.

4. **Run the development server**
   ```bash
   npm run dev
   # or: bun run dev
   ```

5. **Open in Browser**

   Navigate to `http://localhost:8080` to meet Vard!

---

## 🎤 Voice & Chat Flow

1. User clicks the mic button → browser captures audio via `getUserMedia`
2. Raw PCM chunks are collected, downsampled to 16kHz mono, and encoded as a WAV blob
3. WAV is POSTed to `/api/transcribe` with Supabase auth token
4. Lovable AI Gateway transcribes the audio and streams the result back via SSE
5. Transcript appears in the command bar — user can edit or send
6. Chat messages are POSTed to `/api/chat` → Groq streams `llama-3.3-70b-versatile` responses token-by-token
7. User can stop generation with Escape key or stop button

---

## 🎨 Customization

Open the **Brand Panel** in Settings to customize:

- **Logo**: Upload + crop your own logo
- **App Name**: Rename the assistant
- **Accent Color**: Choose from Mint, Violet, Coral, Cyan, Amber
- **Background Style**: Nebula, Aurora, Mesh, Grid, Gradient, and more
- **Route Transitions**: Fade, slide, zoom, blur, lift
- **Motion Intensity**: Duration, easing, and reduced-motion preference

---

## ♿ Accessibility

Vard AI is built with accessibility in mind:

- Respects `prefers-reduced-motion` system preference
- Progress indicators expose `role="progressbar"` and ARIA labels
- Focus states and keyboard shortcuts are supported throughout
- Reduced-motion regression tests run in CI via Playwright
- All animations (spinner, shimmer, toast, modal, route transitions) respect the reduced-motion setting

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/vardhan23v/Vard-AI/issues).

## 📄 License

This project is licensed under the MIT License.

---

Built with ❤️ by [Sree Vardhan V](https://github.com/vardhan23v)
