# @husky-di/website

Minimal TanStack Start homepage for `husky-di`.

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

## Structure

- `src/routes/__root.tsx`: root document shell
- `src/routes/index.tsx`: homepage
- `tailwindcss` + `@tailwindcss/vite`: utility layer kept available for future page work
- `@tanstack/react-router-devtools`, `clsx`, `motion`, `tailwind-merge`: retained for future homepage expansion
- `src/styles/app.scss`: shared homepage styles
- `src/utils/base-path.utils.ts`: GitHub Pages base path helper
