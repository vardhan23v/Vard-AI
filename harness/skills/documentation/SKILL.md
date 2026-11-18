---
name: documentation
description: Write and update READMEs, API docs, code comments and changelogs that are accurate and easy to follow.
version: 1.0.0
tags: [docs, documentation, readme, changelog, comments]
triggers: [document, documentation, docs, readme, changelog, guide, api docs, jsdoc, docstring, comment]
globs: ["**/*.md", "docs/**"]
roles: [planner]
priority: 45
---

# Documentation

## Instructions
- Document what exists: verify every command, option and example against the code before writing it.
- Lead with what the reader needs to do; keep sentences short and concrete.
- Match the existing docs' structure, tone and formatting.
- Code examples must be complete enough to run.
- Comments explain why, not what the code already says. Remove comments that no longer match the code.
- Update the docs in the same change as the behaviour they describe.

## Workflow
1. Read the existing docs and the code they describe.
2. Write or update the text.
3. Run any commands you documented to check they work.
