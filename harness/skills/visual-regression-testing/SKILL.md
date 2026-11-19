---
name: visual-regression-testing
description: Compare screenshots across viewports and changes to catch layout regressions, using measured evidence.
version: 1.0.0
tags: [visual, regression, screenshots, layout, ui]
triggers: [visual regression, screenshot, looks different, layout broke, pixel, visual diff, ui regression]
roles: [browser, frontend]
priority: 50
---

# Visual regression testing

## Instructions
- Take screenshots at the same viewports and states before and after a change (`browser_screenshot`, or `browser_test_responsive` for several viewports).
- Make pages deterministic first: wait for the network to go idle, avoid timestamps and random data, and close banners consistently.
- A visual change isn't a bug by itself. Report a regression only when you can point to a measured problem (overflow, clipping, overlap, missing element) or a clear difference from the intended design.
- Name screenshots by page, state and viewport so they can be compared later.
- If the project already has visual tests (Playwright `toHaveScreenshot`, Chromatic, Percy), use them instead of ad-hoc checks.

## Workflow
1. Capture the baseline.
2. Make or apply the change.
3. Capture again at the same viewports.
4. List the differences with evidence and decide which are regressions.
