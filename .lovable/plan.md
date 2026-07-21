# Rebuild Vard-AI `web` app in this TanStack Start project

Port the Next.js app at `Vard-AI/apps/web` into this project. Keep the visual identity (dark Claude-inspired theme, VardAI branding, sidebar shell, "What do you want to build?" home) and the page structure. Replace Next.js-only pieces with TanStack Start equivalents and Lovable Cloud/AI Gateway.

## Scope

### In scope (Phase 1 — UI shell + pages)
- Global dark theme + Claude-inspired color tokens (bg `#191a1a`, card `#202222`, accent orange `#D97757`, etc.) wired into `src/styles.css` as semantic tokens.
- Persistent sidebar shell (VardAI logo, Home / Workspace / Library nav, Settings + Sign In at bottom) rendered around `<Outlet />` in `src/routes/__root.tsx`.
- Routes:
  - `/` — landing with prompt textarea + Attach/Project/Model/Mic controls + "Generate Code" / "Manage Workspace" suggestion cards
  - `/dashboard` — "Good day, {name}" greeting, `<ChatPrompt />`, suggestion chips (auth-gated)
  - `/dashboard/chat` — `<ChatWindow />` conversation view
  - `/dashboard/agents` — `<VisualBuilder />` placeholder
  - `/library` — placeholder
  - `/settings` — placeholder
  - `/login` — email/password sign-in / sign-up toggle
- Components: `ChatPrompt`, `ChatWindow`, `VisualBuilder`, `Sidebar` — rebuilt as React components under `src/components/`.
- Per-route `head()` metadata (title/description/og) — "Vard AI | The Developer Intelligence Platform" on home.
- Replace `next/link` → `@tanstack/react-router` `Link`; `next/navigation` → `useNavigate`; drop `next/font/google` and load Geist via a `<link>` in `__root.tsx` head.
- lucide-react icons (already Lovable-friendly).

### In scope (Phase 2 — backend, only if you enable Lovable Cloud)
- Auth via Lovable Cloud (email/password) replacing better-auth. Route gate under `src/routes/_authenticated/` for `/dashboard/*`.
- `/api/public/generate` server route calling **Lovable AI Gateway** (Gemini default) — replaces Vard-AI's `/api/generate`.
- `/api/public/health` server route.
- `chats` + `messages` tables with RLS + GRANTs for chat history.

### Out of scope
- The monorepo structure (`apps/`, `packages/ai|auth|cloud|database|types|ui|utils|config`). Everything collapses into this single TanStack Start app.
- `/api/deploy` and `/api/workspace` — not enough info in the source to rebuild meaningfully. Skip unless you tell me what they should do.
- pnpm/turbo, next.config, postcss config — replaced by this project's Vite/Tailwind v4 setup.

## Technical notes

- **Styling**: Vard-AI uses many hardcoded hex classes (`bg-[#191a1a]`). I'll convert to semantic tokens in `src/styles.css` (oklch) so dark/light themes stay coherent — same look, correct architecture.
- **Fonts**: Geist Sans + Geist Mono loaded via Google Fonts `<link>` in `__root.tsx` head (not `@import` in CSS — Tailwind v4 Lightning CSS constraint).
- **Auth gating**: uses the template's `_authenticated` layout (Cloud-managed Supabase). No better-auth port.
- **AI calls**: model selector wired to Lovable AI Gateway model IDs; default `google/gemini-2.5-flash`. Streaming server function.
- **File layout**:
  ```
  src/routes/
    __root.tsx              (sidebar + Outlet)
    index.tsx               (landing)
    login.tsx
    library.tsx
    settings.tsx
    _authenticated/
      route.tsx
      dashboard.tsx         (dashboard index)
      dashboard.chat.tsx
      dashboard.agents.tsx
    api/public/
      generate.ts           (Phase 2)
      health.ts             (Phase 2)
  src/components/
    Sidebar.tsx
    chat/ChatPrompt.tsx
    chat/ChatWindow.tsx
    agents/VisualBuilder.tsx
  ```

## Before I start — two decisions I need from you

1. **Phase 1 only, or Phase 1 + Phase 2?** Phase 1 gives you the full look and navigation with no backend (login page is a non-functional form). Phase 2 enables Lovable Cloud and wires real auth + AI generation.
2. **Chat/agents/library/settings depth?** In the source, `library`, `settings`, `agents/VisualBuilder`, and `ChatWindow` are largely placeholders. Should I ship them as the same placeholders, or flesh out (e.g. a real chat UI with message bubbles)?

Once you confirm, I'll build.
