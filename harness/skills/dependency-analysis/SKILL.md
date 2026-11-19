---
name: dependency-analysis
description: Trace imports, dependents and package usage to understand coupling and what a module relies on.
version: 1.0.0
tags: [dependencies, imports, coupling, graph, packages]
triggers: [dependency, dependencies, depends on, imports, who uses, what uses, coupling, circular, package usage]
roles: [analyst, planner, reviewer]
priority: 50
---

# Dependency analysis

## Instructions
- `code_get_dependencies <file>` shows what a file imports (project files and packages); `code_get_dependents <file>` shows who imports it (use depth 2–3 for indirect).
- `code_find_references` and `code_get_callers` show symbol-level use. They are matched by name through imports, so treat them as best effort in dynamic code and say so.
- Look for hubs (files imported by many others) and cycles; changes there have wide effects.
- For external packages, check where they're used before upgrading or replacing them.
- Report findings with file:line and counts, not impressions.

## Workflow
1. Identify the module.
2. List its dependencies and dependents.
3. Note hubs, cycles and cross-package edges.
4. Summarise the coupling and any risks.
