---
name: codebase-exploration
description: Understand an unfamiliar or large repository quickly using the code index before changing anything.
version: 1.0.0
tags: [codebase, architecture, exploration, onboarding]
triggers: [understand the codebase, where is, how does, architecture, overview, explore, unfamiliar, large repo]
roles: [analyst, planner]
priority: 55
---

# Codebase exploration

## Instructions
- Start broad: `code_get_architecture` for languages, folders, entry points and the most-imported files.
- Find the area: `code_search` with what the code does ("where is authentication handled"), then `code_symbol_search` for names.
- Read the outline before the file: `code_get_file_outline`, then `read_file` with a line range.
- Follow relationships: `code_get_dependencies`, `code_get_dependents`, `code_find_references`.
- Cite everything as file:line. Say when something is a guess.
- Don't read whole large files or dump many files into the conversation; the index gives you the map.

## Workflow
1. Architecture overview.
2. Search for the feature.
3. Follow imports and references to the boundaries.
4. Summarise the relevant files, symbols and how they connect.
