---
name: mcp-server-development
description: Build Model Context Protocol servers that expose tools, resources and prompts with the official SDKs.
version: 1.0.0
tags: [mcp, model-context-protocol, tools, server, sdk]
triggers: [mcp, model context protocol, mcp server, mcp tool, tool server, stdio server, streamable http]
roles: [backend]
priority: 60
---

# MCP server development

## Instructions
- Use the official SDK for the language (`@modelcontextprotocol/sdk` for TypeScript, `mcp` for Python).
- Give every tool a clear name, a one-sentence description and a strict JSON Schema for its input; validate input again in the handler.
- Mark tool annotations honestly (`readOnlyHint`, `destructiveHint`), but never rely on them for safety.
- Return errors as tool results with `isError: true` and a useful message; don't crash the server.
- stdio servers must write only protocol messages to stdout; logs go to stderr.
- Never read secrets from arguments; take them from the environment the client provides.
- Keep outputs small; paginate large results.
- Test with an in-memory or stdio client from the SDK.

## Workflow
1. Define tools, resources and prompts first (names, schemas, outputs).
2. Implement handlers and errors.
3. Write tests that connect a client and call each tool.
4. Document how to add the server to a client (command, args, env).
