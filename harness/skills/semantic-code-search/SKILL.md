---
name: semantic-code-search
description: Find code by what it does, combining meaning, keywords, symbols and paths, and confirm results by reading them.
version: 1.0.0
tags: [search, semantic, find, code-search]
triggers: [find where, where is, search the code, which file, locate, look for]
roles: [analyst, planner, frontend, backend]
priority: 45
---

# Semantic code search

## Instructions
- Describe behaviour, not guesses at names: "where are API keys stored", "what validates the signup form".
- `code_search` combines keywords, symbol names, file paths, import neighbours and (when configured) embeddings. Each hit says why it matched.
- Confirm by reading: open the top hits at their line numbers. Search results are leads, not facts.
- Narrow with names once you have them: `code_symbol_search`, `code_get_definition`.
- If nothing relevant comes back, try other words for the same idea, or `search` for exact strings.

## Workflow
1. Search by behaviour.
2. Read the top two or three hits.
3. Refine with names and references.
4. Report the locations with file:line.
