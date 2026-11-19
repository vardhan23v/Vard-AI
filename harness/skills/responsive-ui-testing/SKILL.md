---
name: responsive-ui-testing
description: Check layouts on mobile, tablet and desktop with real DOM measurements and fix responsive problems at their source.
version: 1.0.0
tags: [responsive, mobile, tablet, desktop, layout, css, ui]
triggers: [responsive, mobile, tablet, desktop, viewport, breakpoint, layout, overflow, scrolls sideways, media query]
roles: [browser, frontend]
priority: 60
---

# Responsive UI testing

## Instructions
- Test real viewports with `browser_test_responsive` (mobile 375, tablet 768, desktop 1920 at least). It measures overflow, clipped text, covered or off-screen controls, small tap targets, unlabeled fields, broken images and hidden navigation.
- Trust measurements, not guesses: every finding should name the element and the measured value (for example "scrollWidth 412px > viewport 375px").
- Typical fixes: fixed widths become `max-width: 100%` or fluid units; long words get `overflow-wrap: anywhere`; grids and flex rows wrap or stack at a breakpoint; images get `max-width: 100%; height: auto`; tap targets at least 24×24px (44 is better); navigation gets a visible toggle on small screens.
- Fix the component that causes the problem (find it with `code_search` and the selector), not the page around it.
- Re-test the same viewports after fixing.

## Workflow
1. Start the dev server and run the responsive test.
2. Trace each finding to its component.
3. Fix, then re-test until the findings are gone or explained.
