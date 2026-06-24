# @husky-di/website

TanStack Start file-based documentation app for `husky-di`.

## Scripts

```bash
pnpm --filter @husky-di/website dev
pnpm --filter @husky-di/website build
```

## GitHub Pages

The website is configured for static prerendering and GitHub Pages deployment.

- Default production base path: `/<repository-name>/`
- Override base path: set `WEBSITE_BASE_PATH`
- Published artifact directory: `website/dist/client`
- Automatic deployment runs on `master` push only when `.github/workflows/website-pages.yml` or `website/**` changes; otherwise use `workflow_dispatch`

## Route Structure

- `src/routes/index.tsx`: landing page
- `src/routes/guides/*`: guide pages
- `src/routes/reference/*`: reference pages

## Writing Docs

1. Add or edit route files under `src/routes/`.
2. Reuse the section layout files in `guides/route.tsx` and `reference/route.tsx`.
3. Use the shared styles in `src/styles/app.css` for consistent presentation.
