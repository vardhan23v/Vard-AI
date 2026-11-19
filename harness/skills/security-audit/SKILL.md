---
name: security-audit
description: Check code and changes for common security problems - injection, broken auth, secrets, unsafe input handling and risky dependencies.
version: 1.0.0
tags: [security, audit, owasp, auth, secrets, vulnerabilities]
triggers: [security, vulnerability, audit, owasp, xss, csrf, sql injection, injection, secrets, auth, authorization, permission, cve]
roles: [reviewer, backend]
priority: 65
---

# Security audit

## Instructions
- Trace untrusted input (request data, files, environment, third-party responses) to where it is used: SQL and shell commands, HTML output, file paths, redirects, deserialisation.
- Check authentication and authorization on the server for every protected action; hidden UI is not protection.
- Look for secrets in code, config and logs; they belong in environment or a secret store.
- Check password storage (slow hash), session/token handling (HttpOnly, Secure, SameSite, expiry), CSRF protection for cookie auth, CORS settings and rate limiting on login.
- Check file uploads (type, size, storage path) and path handling (no `..` escapes).
- Note risky or outdated dependencies only when there's evidence (lockfile version, known advisory).
- Never run exploit code or scanners against systems you don't own; static reading and local tests only.

## Workflow
1. Map the entry points relevant to the task.
2. Review each against the list above.
3. Report findings with severity, location, impact and a concrete fix.
