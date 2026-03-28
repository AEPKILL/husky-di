# husky-di-code-standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal repository entrypoint and a single repository-private skill that defines the husky-di code standard.

**Architecture:** Keep `AGENTS.md` directory-like and small. Put the real standard in `.agents/skills/husky-di-code-standard/SKILL.md`, following the approved design spec and existing repository style.

**Tech Stack:** Markdown, repository skills, local repository conventions

---

### Task 1: Add the repository entrypoint

**Files:**
- Create: `AGENTS.md`
- Check: `.agents/skills/husky-di-code-standard/SKILL.md`

- [ ] **Step 1: Write the minimal entrypoint content**

```markdown
# AGENTS

- Any code modification in this repository must use `husky-di-code-standard`.
- Treat new files, edits, refactors, tests, file moves, export changes, naming changes, and structural changes as code modification.
- Full standard: `.agents/skills/husky-di-code-standard/SKILL.md`
- Use this repository standard alongside any other applicable workflow skills.
- This file is only a directory and enforcement entrypoint. Keep the detailed rules in the skill.
```

- [ ] **Step 2: Verify the entrypoint stays minimal**

Run: `sed -n '1,120p' AGENTS.md`
Expected: A short file that points to `husky-di-code-standard` and does not duplicate the standard.

### Task 2: Add the repository-private skill

**Files:**
- Create: `.agents/skills/husky-di-code-standard/SKILL.md`
- Reference: `docs/superpowers/specs/2026-03-28-husky-di-code-standard-design.md`

- [ ] **Step 1: Write the skill frontmatter and overview**

```markdown
---
name: husky-di-code-standard
description: Use when modifying code in the husky-di repository and the change must follow the repository's established naming, placement, structure, header comment, and testing conventions
---
```

- [ ] **Step 2: Add the execution sections**

Write sections for:

- overview
- when to use
- workflow
- quick reference
- placement rules
- file naming
- symbol naming
- import and export rules
- file shape and headers
- implementation style
- type modeling
- errors and exceptions
- biome-ignore
- tests and public API
- new pattern policy
- final check
- common mistakes
- local examples

- [ ] **Step 3: Verify the skill matches the approved design**

Run: `sed -n '1,260p' .agents/skills/husky-di-code-standard/SKILL.md`
Expected: The skill is the only detailed standard, stays repository-specific, and includes the approved rules about headers, naming, placement, and asking before introducing new patterns.

### Task 3: Self-review and verify

**Files:**
- Check: `AGENTS.md`
- Check: `.agents/skills/husky-di-code-standard/SKILL.md`

- [ ] **Step 1: Check for duplicate sources of truth**

Run: `rg -n "husky-di-code-standard|directory and enforcement entrypoint|detailed rules" AGENTS.md .agents/skills/husky-di-code-standard/SKILL.md`
Expected: `AGENTS.md` only points to the skill and the skill contains the detailed rules.

- [ ] **Step 2: Check for placeholder text**

Run: `rg -n "TODO|TBD|placeholder" AGENTS.md .agents/skills/husky-di-code-standard/SKILL.md`
Expected: No placeholder results.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md .agents/skills/husky-di-code-standard/SKILL.md docs/superpowers/plans/2026-03-28-husky-di-code-standard.md
git commit -m "feat: add husky-di code standard skill"
```
