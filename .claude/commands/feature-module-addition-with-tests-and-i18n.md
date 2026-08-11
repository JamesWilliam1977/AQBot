---
name: feature-module-addition-with-tests-and-i18n
description: Workflow command scaffold for feature-module-addition-with-tests-and-i18n in AQBot.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-module-addition-with-tests-and-i18n

Use this workflow when working on **feature-module-addition-with-tests-and-i18n** in `AQBot`.

## Goal

Add a new feature module, including backend, frontend, tests, and i18n updates.

## Common Files

- `src-tauri/crates/core/src/entity/*.rs`
- `src-tauri/crates/core/src/repo/*.rs`
- `src-tauri/crates/core/src/types.rs`
- `src-tauri/crates/core/src/db.rs`
- `src-tauri/crates/migration/src/*.rs`
- `src-tauri/src/commands/*.rs`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create/update backend Rust files (entity, repo, commands, migration, types)
- Create/update frontend React components for the new module
- Add/update store and types
- Add/update tests for lib, components, pages, and stores
- Add/update i18n locale files for new strings

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.