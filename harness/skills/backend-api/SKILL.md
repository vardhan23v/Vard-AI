---
name: backend-api
description: Design and implement HTTP APIs and server-side logic with input validation, clear errors and safe authentication.
version: 1.0.0
tags: [backend, api, rest, http, server, node, express, fastify, auth]
triggers: [api, endpoint, route, rest, server, express, fastify, hono, controller, middleware, authentication, login, jwt, session]
roles: [backend]
priority: 60
---

# Backend API development

## Instructions
- Follow the framework and folder structure already in the project (router files, controllers, services).
- Validate every input at the boundary (body, query, params, headers) with the project's validator (zod, joi, class-validator…). Reject unknown or malformed input with 400.
- Return consistent JSON errors and correct status codes: 400 bad input, 401 not signed in, 403 not allowed, 404 missing, 409 conflict, 500 unexpected (without leaking stack traces).
- Authentication: never store plain-text passwords (use the existing hashing, or bcrypt/argon2); compare secrets in constant time; keep tokens in HttpOnly cookies or the existing mechanism; check authorization on the server for every protected action.
- Never hard-code secrets. Read them from configuration/environment the way the project already does.
- Keep business logic out of route handlers so it can be tested directly.
- Document new endpoints where the project documents others (OpenAPI file, README, comments).

## Workflow
1. Read the existing routes and one complete request path (handler → service → data).
2. Write the contract first (method, path, request, response, errors), then implement.
3. Add tests for success, validation failure and authorization failure.
4. Run the tests and typecheck; review the diff.
