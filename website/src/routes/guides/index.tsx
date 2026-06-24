/**
 * Guides index route.
 *
 * @overview
 * Summarizes the purpose of the guides section and suggests a starting path
 * for future documentation contributors.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/guides/")({
	component: GuidesIndexPage,
});

function GuidesIndexPage() {
	return (
		<article className="prose-card">
			<h3>Guide section overview</h3>
			<p>
				Start guides from the reader&apos;s job-to-be-done, not from the package
				tree. A strong guide explains why Husky DI behaves the way it does, what
				problem a feature solves, and which tradeoffs a reader should care
				about.
			</p>
			<p>
				Good candidates here include quick starts, module composition
				walkthroughs, decorator setup notes, debugging patterns, and migration
				guides.
			</p>
		</article>
	);
}
