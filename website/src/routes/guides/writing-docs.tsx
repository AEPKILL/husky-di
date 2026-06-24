/**
 * Writing docs guide route.
 *
 * @overview
 * Explains how to extend the file-based documentation app with new pages and
 * section routes.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/guides/writing-docs")({
	component: WritingDocsGuidePage,
});

function WritingDocsGuidePage() {
	return (
		<article className="prose-card">
			<h3>How to add new docs pages</h3>
			<ol>
				<li>Add a new route file under `src/routes/` or the appropriate section folder.</li>
				<li>Use `route.tsx` for shared section layouts and `index.tsx` for section home pages.</li>
				<li>Keep global shell concerns in `__root.tsx` and section-specific navigation in the section route.</li>
				<li>Run `pnpm --filter @husky-di/website build` to regenerate `routeTree.gen.ts` and verify the site.</li>
			</ol>
		</article>
	);
}
