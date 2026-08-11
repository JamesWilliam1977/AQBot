```markdown
# AQBot Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you the core development patterns, coding conventions, and workflows for contributing to the AQBot project. AQBot is a full-stack application using Rust for the backend and React for the frontend. The repository emphasizes clear commit conventions, modular code structure, and robust testing practices. This guide will help you quickly align with the project's standards and efficiently participate in its development.

## Coding Conventions

### File Naming

- **CamelCase** is used for file and directory names.
  - Example: `drawingStore.ts`, `UserPage.tsx`, `libModels.ts`

### Import Style

- **Alias imports** are preferred for clarity and modularity.
  - Example:
    ```typescript
    import * as DrawingStore from '../stores/drawingStore';
    import { DrawingPage } from '../pages/DrawingPage';
    ```

### Export Style

- **Named exports** are used throughout the codebase.
  - Example:
    ```typescript
    // src/stores/drawingStore.ts
    export const useDrawingStore = () => { ... };
    export function resetDrawing() { ... }
    ```

### Commit Messages

- **Conventional commit** style is enforced.
- Prefixes include: `chore`, `feat`, `ci`, `fix`.
- Example:
  ```
  feat: add drawing module backend and UI
  fix: correct locale loading on startup
  chore: update dependencies
  ci: improve windows build workflow
  ```

## Workflows

### Bump Version

**Trigger:** When releasing a new version of the application  
**Command:** `/bump-version`

1. Update the version number in `package.json`.
2. Update the version number in `src-tauri/tauri.conf.json`.
3. Commit the changes with a version bump message, e.g.:
   ```
   chore: bump version to 1.2.3
   ```

### Update Release CI Workflow

**Trigger:** When optimizing or fixing the release/build CI workflows  
**Command:** `/update-ci`

1. Edit `.github/workflows/release.yml` and/or other workflow files:
   - `.github/workflows/test-build.yml`
   - `.github/workflows/test-windows-build.yml`
2. Commit with a CI-related message, e.g.:
   ```
   ci: update release workflow for caching
   ```

### Feature Module Addition with Tests and i18n

**Trigger:** When adding a major new module (e.g., drawing), with backend, frontend, tests, and localization  
**Command:** `/add-feature-module`

1. **Backend (Rust):**
   - Create/update entity, repo, types, and migration files:
     - `src-tauri/crates/core/src/entity/<module>.rs`
     - `src-tauri/crates/core/src/repo/<module>.rs`
     - `src-tauri/crates/core/src/types.rs`
     - `src-tauri/crates/core/src/db.rs`
     - `src-tauri/crates/migration/src/<module>.rs`
     - `src-tauri/src/commands/<module>.rs`
2. **Frontend (React):**
   - Create/update components and pages:
     - `src/components/<module>/*.tsx`
     - `src/pages/<Module>Page.tsx`
   - Update stores and types:
     - `src/stores/<module>Store.ts`
     - `src/lib/<module>Models.ts`
3. **Testing:**
   - Add/update tests for lib, components, pages, and stores:
     - `src/components/<module>/__tests__/*.test.tsx`
     - `src/pages/__tests__/<Module>Page.test.tsx`
     - `src/stores/__tests__/<module>Store.test.ts`
     - `src/lib/__tests__/<module>Models.test.ts`
4. **Localization:**
   - Add/update i18n locale files:
     - `src/i18n/locales/*.json`
5. **Update relevant index and layout files as needed.**
6. Commit with a descriptive message, e.g.:
   ```
   feat: add drawing module with i18n and tests
   ```

## Testing Patterns

- **Framework:** [vitest](https://vitest.dev/)
- **Test File Pattern:** Files end with `.test.tsx` and are colocated with the code they test.
  - Example:
    ```
    src/components/drawing/__tests__/DrawingCanvas.test.tsx
    src/pages/__tests__/DrawingPage.test.tsx
    src/stores/__tests__/drawingStore.test.ts
    ```
- **Test Example:**
  ```typescript
  import { render } from '@testing-library/react';
  import { DrawingPage } from '../DrawingPage';

  test('renders drawing page', () => {
    const { getByText } = render(<DrawingPage />);
    expect(getByText('Start Drawing')).toBeInTheDocument();
  });
  ```

## Commands

| Command             | Purpose                                                      |
|---------------------|--------------------------------------------------------------|
| /bump-version       | Bump application version for a new release                   |
| /update-ci          | Update or optimize CI/CD workflows for releases and builds   |
| /add-feature-module | Add a new feature module with backend, frontend, tests, i18n |
```
