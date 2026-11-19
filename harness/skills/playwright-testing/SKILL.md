---
name: playwright-testing
description: Write and run Playwright end-to-end tests with resilient locators, web-first assertions and isolated test data.
version: 1.0.0
tags: [playwright, e2e, testing, browser]
triggers: [playwright, e2e test, end-to-end test, browser test, spec.ts, test:e2e]
globs: ["playwright.config.*", "e2e/**", "tests/e2e/**"]
roles: [testing, browser, frontend]
priority: 55
---

# Playwright testing

## Instructions
- Use the project's existing Playwright setup and config. Add `@playwright/test` only if the user asks for e2e tests and none exist.
- Locate by role, label and text (`getByRole('button', { name: 'Save' })`); avoid CSS chains and XPath.
- Use web-first assertions (`await expect(locator).toBeVisible()`), never fixed sleeps.
- Each test sets up its own data and doesn't depend on another test's state.
- Run against the local dev server (`webServer` in the config), never production.
- Keep tests focused: one user flow per test, named after what the user does.

## Workflow
1. Read the existing config and one existing spec.
2. Write the test for the flow.
3. Run it (`npx playwright test <file>` or the project's script) and fix failures by fixing the cause.
