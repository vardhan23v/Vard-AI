---
name: react-development
description: Build and change React components and hooks with type safety, accessible markup and the project's own conventions.
version: 1.0.0
tags: [react, frontend, typescript, components, hooks, jsx, tsx]
triggers: [react, component, hook, jsx, tsx, useState, useEffect, props, render, ui]
globs: ["**/*.tsx", "**/*.jsx"]
roles: [frontend]
priority: 60
---

# React development

## Instructions
- Read two or three nearby components first and copy their patterns: file layout, naming, styling approach (Tailwind, CSS modules, styled-components), state library and data fetching.
- Use the component library already in the project (for example shadcn/ui or MUI). Don't add a second one.
- Keep components small and typed. Type props explicitly; avoid `any`.
- Derive values instead of syncing them with `useEffect`. Effects are for talking to things outside React.
- Every list item needs a stable `key` (an id, not the index, when the list can change).
- Handle loading, error and empty states for anything asynchronous.
- Use semantic elements (`button`, `a`, `label`, headings in order) and make everything work with the keyboard.
- Don't add dependencies unless the task needs them; say why if you do.

## Workflow
1. Find where the change belongs with `search` and `list_dir`; read the parent component and its callers.
2. Make the change with `edit_file`, matching existing style.
3. Update or add tests next to the component if the project has them.
4. Run the project's typecheck and tests (look in package.json scripts) with `run_command`.
5. Review `git_diff` before finishing.
