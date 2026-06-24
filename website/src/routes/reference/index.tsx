/**
 * Reference index route.
 *
 * @overview
 * Introduces the reference section and clarifies what belongs in reference
 * pages versus conceptual guides.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reference/")({
	component: ReferenceIndexPage,
});

function ReferenceIndexPage() {
	return (
		<article className="prose-card">
			<h3>Reference section overview</h3>
			<p>
				Reference pages should optimize for precision: what an API does, what
				inputs it accepts, what lifecycle or resolution guarantees it makes, and
				which adjacent specifications or ADRs govern it.
			</p>
			<p>
				If a page needs storytelling, migration framing, or step-by-step
				instruction, it usually belongs in Guides instead.
			</p>
		</article>
	);
}
