---
name: update-release-ci-workflow
description: Workflow command scaffold for update-release-ci-workflow in AQBot.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /update-release-ci-workflow

Use this workflow when working on **update-release-ci-workflow** in `AQBot`.

## Goal

Optimize or modify the CI/CD pipeline for releases and builds.

## Common Files

- `.github/workflows/release.yml`
- `.github/workflows/test-build.yml`
- `.github/workflows/test-windows-build.yml`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit .github/workflows/release.yml and/or other workflow files
- Commit with a CI-related message

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.