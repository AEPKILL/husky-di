/**
 * Getting started guide route.
 *
 * @overview
 * Provides a starter outline for onboarding documentation in the website app.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/guides/getting-started")({
	component: GettingStartedGuidePage,
});

function GettingStartedGuidePage() {
	return (
		<article className="prose-card">
			<h3>Getting started template</h3>
			<p>
				This page is a seed document you can reshape into the real onboarding
				experience for Husky DI users.
			</p>
			<ul>
				<li>Start with the problem Husky DI solves in one short paragraph.</li>
				<li>
					Show the smallest useful setup that reaches first value quickly.
				</li>
				<li>Introduce `@husky-di/core` before decorator or module packages.</li>
				<li>Link out to reference pages only after the core flow is clear.</li>
			</ul>
		</article>
	);
}
