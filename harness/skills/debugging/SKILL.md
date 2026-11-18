---
name: debugging
description: Find and fix the root cause of bugs, crashes and failing behaviour with a reproduce-isolate-fix-verify loop.
version: 1.0.0
tags: [debugging, bug, fix, error, crash, stack-trace]
triggers: [bug, fix, error, crash, broken, failing, exception, stack trace, regression, not working, debug, undefined, "null"]
roles: [backend, frontend, testing]
priority: 55
---

# Debugging

## Instructions
- Reproduce first. Find or write the smallest command or test that shows the problem.
- Read the whole error and stack trace; open the exact file and line it points to.
- Form one hypothesis at a time and check it with evidence (search for callers, read the data flow, add a temporary log or test).
- Fix the cause, not the symptom. Don't silence errors, widen types or skip tests to make a failure disappear.
- Keep the fix minimal and remove temporary logging.
- Add a regression test that fails before the fix and passes after.

## Workflow
1. Reproduce with `run_command`.
2. Isolate with `search` and `read_file`.
3. Fix with `edit_file`.
4. Verify: the reproduction now passes and the full test suite still passes.
5. Summarise the cause, the fix and how you verified it.
