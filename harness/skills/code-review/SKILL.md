---
name: code-review
description: Review a change for correctness, security, maintainability and test coverage, and report concrete findings.
version: 1.0.0
tags: [review, code-review, quality, correctness]
triggers: [review, code review, audit the change, check the diff, pull request, pr]
roles: [reviewer]
priority: 70
---

# Code review

## Instructions
- Review the actual diff (`git_diff`) and read the surrounding code for every changed function; a diff alone hides callers.
- Look for, in order: correctness bugs (wrong logic, off-by-one, null/undefined, async races, error handling), security problems (injection, missing authorization, secrets, unsafe input), data loss, breaking API changes, missing tests, then maintainability.
- Every finding names the file and line, says what goes wrong in a concrete scenario, and how serious it is (critical, high, medium, low).
- Don't report style preferences the project's linter or formatter would handle. Don't invent problems: if unsure, say what you'd need to check.
- Say clearly when the change is good to go.

## Workflow
1. Read the task and the diff stat to know the scope.
2. Go file by file; run the tests if you can.
3. Report findings, most severe first, and a verdict: approve or changes requested.
