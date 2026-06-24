# @husky-di/website

TanStack Start file-based documentation app for `husky-di`.

## Scripts

```bash
pnpm --filter @husky-di/website dev
pnpm --filter @husky-di/website build
```

## Route Structure

- `src/routes/index.tsx`: landing page
- `src/routes/guides/*`: guide pages
- `src/routes/reference/*`: reference pages

## Writing Docs

1. Add or edit route files under `src/routes/`.
2. Reuse the section layout files in `guides/route.tsx` and `reference/route.tsx`.
3. Use the shared styles in `src/styles/app.css` for consistent presentation.
