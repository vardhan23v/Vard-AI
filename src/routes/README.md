# Routes

File-based routes for [TanStack Router](https://tanstack.com/router) (SPA). The Vite plugin generates `src/routeTree.gen.ts`; don't edit it by hand.

| File | URL | Notes |
|---|---|---|
| `__root.tsx` | — | Providers, error and 404 pages; keep `<Outlet />` |
| `index.tsx` | `/` | Redirects to `/chat` |
| `login.tsx` | `/login` | Google and email sign-in |
| `chat.tsx` | `/chat/*` | App shell with the chat list (signed in only) |
| `chat.index.tsx` | `/chat` | New chat |
| `chat.$conversationId.tsx` | `/chat/:id` | A conversation |
| `projects.tsx` | `/projects/*` | App shell with the project list (signed in only) |
| `projects.index.tsx` | `/projects` | Add a project |
| `projects.$projectId.tsx` | `/projects/:id?task=…` | Tasks and the task view |
| `settings.tsx`, `settings.index.tsx` | `/settings` | Keys, appearance, agent status |

Signed-in sections use the `requireAuth` guard from `src/lib/guard.ts` in `beforeLoad`.
