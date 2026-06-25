# Release Guide

This document explains how to use Changesets for versioning and releases.

## Basic workflow

### 1. Develop a feature or fix a bug

Do your work as usual and commit it to a feature branch.

### 2. Create a changeset

When your change is ready to ship, create a changeset:

```bash
pnpm changeset
```

The command will guide you through:

- selecting the affected packages
- selecting the change type (`patch`, `minor`, or `major`)
- adding a release note

### 3. Commit the changeset

Commit the generated changeset file together with your code changes:

```bash
git add .changeset/your-changeset-file.md
git commit -m "feat: add new feature with changeset"
```

### 4. Merge into the main branch

Open a PR and merge it into the `master` branch.

### 5. Automatic release

After the merge, GitHub Actions will:

- update versions and changelogs automatically
- commit the version changes back to `master`
- publish packages to npm
- push the release tags

## Change type guide

### Patch

- bug fixes
- documentation updates
- internal refactors that do not change the API

### Minor

- new features
- new public APIs
- backward-compatible changes

### Major

- breaking changes
- removed or changed public APIs
- incompatible behavior changes

## Package dependency relationships

Package dependencies in this repository:

- `@husky-di/decorator` depends on `@husky-di/core`
- `@husky-di/module` depends on `@husky-di/core`

When the `core` package changes, dependent packages automatically receive updated dependency versions.

## Manual release commands

Use these commands when you need manual control over the release process:

```bash
# View pending release changes
pnpm changeset status

# Update versions without publishing
pnpm changeset:version

# Publish to npm
pnpm changeset:publish

# Create snapshot versions for testing
pnpm changeset:snapshot
```

## Prerelease versions

Create prerelease versions for testing:

```bash
# Enter prerelease mode
pnpm changeset pre enter alpha

# Create prerelease versions
pnpm changeset version
pnpm changeset publish --tag alpha

# Exit prerelease mode
pnpm changeset pre exit
```

## Troubleshooting

### If GitHub Actions fails

1. Check whether `NPM_TOKEN` is configured in repository Secrets.
2. Make sure `Settings > Actions > General > Workflow permissions` allows the workflow to write to the repository.
3. Make sure the package names are available on npm.
4. Check the package access settings.

### If versions conflict

```bash
# Reset to the latest version
git pull origin master
pnpm changeset version
```

### GitHub Actions release flow

The release workflow on `master` runs in the following order:

0. The workflow is triggered automatically only by release-related paths: `.changeset/**`, `packages/**`, and `.github/workflows/release.yml`. Changes only under `website/` do not trigger release automatically; use `workflow_dispatch` when needed.
1. Install dependencies, run tests, and build packages.
2. Check whether `.changeset/*.md` contains any pending changesets.
3. If pending changesets exist, run `changeset version` to update versions and changelogs.
4. Commit the version changes back to `master`.
5. Run `changeset publish` to publish to npm.
6. Push the release tags.

If `master` has no pending changesets, the workflow still checks whether any current package version has not yet been published. If nothing is publishable, the publish step is skipped.

### If you need to skip publishing a package

Add it to the `ignore` array in `.changeset/config.json`:

```json
{
  "ignore": ["@husky-di/package-name"]
}
```
