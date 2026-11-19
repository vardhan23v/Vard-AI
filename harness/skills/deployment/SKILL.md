---
name: deployment
description: Prepare builds, CI pipelines, containers and deployment configuration safely, without deploying anything yourself.
version: 1.0.0
tags: [deployment, ci, cd, docker, build, release, devops]
triggers: [deploy, deployment, ci, cd, pipeline, github actions, docker, dockerfile, build, release, vercel, netlify, kubernetes]
globs: [".github/workflows/**", "Dockerfile", "docker-compose.*", "vercel.json", "netlify.toml"]
roles: [backend]
priority: 50
---

# Deployment

## Instructions
- Never deploy, publish or push yourself. Prepare the configuration and tell the user the command to run.
- Builds must be reproducible: pin tool versions where the project does, use lockfiles, and use the project's package manager.
- Secrets come from the CI or hosting provider's secret store, never from files in the repository.
- CI: cache dependencies, run typecheck, lint, tests and build; fail fast; keep jobs small.
- Containers: small base images, non-root user, multi-stage builds, `.dockerignore`, explicit ports and health checks.
- Every change to deployment config should say how to roll back.

## Workflow
1. Read the existing build scripts and CI files.
2. Make the change; validate YAML/JSON syntax and run the build locally if possible.
3. List the manual steps (secrets to add, commands to run) in your summary.
