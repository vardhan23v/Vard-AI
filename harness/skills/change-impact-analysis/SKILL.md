---
name: change-impact-analysis
description: Before changing code, find what depends on it, which tests cover it and how to verify the change.
version: 1.0.0
tags: [impact, risk, refactor, change, verification]
triggers: [impact, what could break, before changing, refactor, rename, change the, modify, risk]
roles: [analyst, planner, backend, frontend]
priority: 60
---

# Change impact analysis

## Instructions
- Run `code_impact_analysis` on the files or symbols you plan to change before editing them.
- Use the report: update every direct dependent that uses what you change, keep exported API compatible or change all callers, and run the related tests and the listed verification commands.
- The risk level comes from counted evidence (dependents, exported API, cross-package use, missing tests). Quote the evidence; don't make up a risk level.
- When no tests cover the change, add one or say plainly that it's untested.
- Re-run the analysis after a large change if the plan shifted.

## Workflow
1. Impact analysis on the targets.
2. Plan edits for the target and its dependents.
3. Make the change.
4. Run the related tests and verification commands.
