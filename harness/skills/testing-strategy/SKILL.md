---
name: testing-strategy
description: Write focused unit, integration and regression tests with the project's test framework, and diagnose failing tests.
version: 1.0.0
tags: [testing, tests, unit, integration, jest, vitest, bun, pytest, playwright, coverage]
triggers: [test, tests, testing, unit test, integration test, coverage, jest, vitest, pytest, playwright, cypress, regression, failing test, spec]
globs: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "vitest.config.*", "jest.config.*"]
roles: [testing]
priority: 60
---

# Testing strategy

## Instructions
- Use the framework and file conventions already in the project (check package.json scripts and existing test files). Don't add a new framework.
- Test behaviour through public interfaces, not implementation details.
- Cover the happy path, edge cases (empty, boundary values, invalid input) and error paths. For a bug fix, first write a test that fails without the fix.
- Keep tests deterministic: no real network, no sleeps, fixed clocks and seeds, temporary directories cleaned up.
- Mock only at boundaries (network, clock, filesystem when needed).
- One behaviour per test, with a name that says what is expected.
- When a test fails, read the full output, reproduce it with the narrowest command, and fix the cause, not the assertion.

## Workflow
1. Find existing tests for the area and run them once to see the baseline.
2. Write or update tests.
3. Run the narrow test command, then the full suite.
4. Report what is covered and anything left untested.
