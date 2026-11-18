---
name: accessibility
description: Make web interfaces usable with a keyboard and screen reader, with sufficient contrast, following WCAG 2.1 AA.
version: 1.0.0
tags: [accessibility, a11y, wcag, aria, frontend, ui]
triggers: [accessibility, accessible, a11y, wcag, aria, screen reader, keyboard, focus, contrast, alt text]
roles: [frontend]
priority: 50
---

# Accessibility

## Instructions
- Use native elements first: `button` for actions, `a` for navigation, `label` tied to inputs, headings in order, landmarks (`nav`, `main`).
- Use ARIA only when no native element expresses the role or state, and keep it in sync with the UI.
- Everything works with the keyboard in a logical order with a visible focus style; Escape closes dialogs and menus; dialogs trap focus and return it on close.
- Images have meaningful `alt` text (empty for decorative ones).
- Form errors are shown in text, linked with `aria-describedby`, and announced.
- Text contrast is at least 4.5:1 (3:1 for large text and controls); never use colour alone to carry meaning.
- Respect `prefers-reduced-motion`.

## Workflow
1. Read the component and how it's used.
2. Fix semantics first, then keyboard, then labels and contrast.
3. Add tests with the project's testing library queries by role and label.
