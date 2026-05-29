---
name: bump-version
description: Workflow command scaffold for bump-version in AQBot.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /bump-version

Use this workflow when working on **bump-version** in `AQBot`.

## Goal

Bump the application version for a new release.

## Common Files

- `package.json`
- `src-tauri/tauri.conf.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update the version number in package.json
- Update the version number in src-tauri/tauri.conf.json
- Commit the changes with a version bump message

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.