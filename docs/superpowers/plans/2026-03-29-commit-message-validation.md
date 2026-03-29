# Commit Message Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Angular-style commit messages in local git workflows using a mature tool that fits the existing Husky and pnpm setup.

**Architecture:** Keep the validation rule set at the repository root with `commitlint` and `@commitlint/config-conventional`, then wire the existing Husky setup through a new `commit-msg` hook. Prove the behavior with `node:test` coverage inside the private `@husky-di/scripts` workspace by invoking the same root package script that the hook uses.

**Tech Stack:** pnpm, Husky, Commitlint, node:test, tsx

---

## File Structure

- Create: `docs/superpowers/plans/2026-03-29-commit-message-validation.md`
- Create: `scripts/tests/check-commit-message.test.ts`
- Create: `commitlint.config.js`
- Create: `.husky/commit-msg`
- Modify: `package.json`
- Modify: `scripts/package.json`
- Modify: `pnpm-lock.yaml`

### Task 1: Add failing commit message validation tests

**Files:**
- Create: `scripts/tests/check-commit-message.test.ts`
- Modify: `scripts/package.json`
- Modify: `package.json`

- [ ] **Step 1: Add a focused test entry for commit message validation**

Add a dedicated `test:commit-message` script under `scripts/package.json` and a root `test:commit-message` passthrough in `package.json` so the repository can run the new test suite directly.

- [ ] **Step 2: Write the failing tests**

Create `scripts/tests/check-commit-message.test.ts` with one passing Angular-style commit message case and one rejected free-form message case. Each test should write a temporary commit message file, invoke the root package script, and assert on the exit behavior.

- [ ] **Step 3: Run the new test suite and confirm it fails before implementation**

Run: `pnpm test:commit-message`
Expected: FAIL because the root commit message linting command is not wired yet.

### Task 2: Wire commitlint into the repository

**Files:**
- Create: `commitlint.config.js`
- Create: `.husky/commit-msg`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add mature commit message validation dependencies**

Add `@commitlint/cli` and `@commitlint/config-conventional` to the root `devDependencies`.

- [ ] **Step 2: Add the root commitlint configuration**

Create `commitlint.config.js` so the repository extends `@commitlint/config-conventional`.

- [ ] **Step 3: Add the reusable root command**

Add `lint:commit-message` to `package.json` with `commitlint --edit` so both tests and hooks use the same repository command.

- [ ] **Step 4: Add the Husky commit-msg hook**

Create `.husky/commit-msg` so it runs `pnpm lint:commit-message -- "$1"`.

- [ ] **Step 5: Re-run the focused test suite**

Run: `pnpm test:commit-message`
Expected: PASS with the Angular-style message accepted and the invalid message rejected.

### Task 3: Verify the repository workflow

**Files:**
- Check: `.husky/commit-msg`
- Check: `commitlint.config.js`
- Check: `package.json`
- Check: `scripts/tests/check-commit-message.test.ts`

- [ ] **Step 1: Run the repository code standard and commit message verification commands**

Run: `pnpm check:code-standard && pnpm test:commit-message`
Expected: PASS with no code standard failures and no commit message test failures.

- [ ] **Step 2: Inspect the resulting diff**

Run: `git diff -- package.json scripts/package.json commitlint.config.js .husky/commit-msg scripts/tests/check-commit-message.test.ts`
Expected: Only the intended commit message validation changes appear.
