---
name: nextjs-development
description: Work in Next.js apps (App Router or Pages Router) - routes, server and client components, data fetching and route handlers.
version: 1.0.0
tags: [nextjs, next, react, ssr, frontend, fullstack]
triggers: [next.js, nextjs, app router, server component, route handler, getServerSideProps, middleware, next/]
globs: ["next.config.*", "app/**/page.tsx", "pages/**/*.tsx", "src/app/**/page.tsx"]
roles: [frontend, backend]
priority: 65
conflicts: []
---

# Next.js development

## Instructions
- Check which router the project uses: `app/` (App Router) or `pages/` (Pages Router). Never mix them for one feature.
- App Router: components are server components by default. Add `"use client"` only to components that need state, effects or browser APIs, and keep that boundary as low in the tree as possible.
- Fetch data in server components or route handlers, not in client effects, unless the data is user-interactive.
- Secrets and server-only modules must never be imported into client components. Only `NEXT_PUBLIC_*` variables reach the browser.
- Route handlers (`app/**/route.ts`) validate input and return proper status codes.
- Use `next/link`, `next/image` and the metadata API the way the project already does.

## Workflow
1. Read `next.config.*`, the layout for the route you're changing and one sibling route.
2. Implement the change; keep server/client boundaries explicit.
3. Run the typecheck, lint and `next build` (or the project's build script) with `run_command`; a build catches server/client mistakes that tests miss.
4. Review the diff.
