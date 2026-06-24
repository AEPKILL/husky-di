/**
 * Core reference route.
 *
 * @overview
 * Seeds the core package reference area with the main subject areas future
 * docs should expand.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reference/core")({
	component: CoreReferencePage,
});

function CoreReferencePage() {
	return (
		<article className="prose-card">
			<h3>`@husky-di/core` reference starter</h3>
			<ul>
				<li>Container creation, hierarchy, and disposal semantics</li>
				<li>Registration strategies and last-write-wins behavior</li>
				<li>Resolve options such as `optional`, `multiple`, `ref`, and `dynamic`</li>
				<li>Middleware ordering, scope, and `onContainerDispose` behavior</li>
				<li>`RegistrationPlan` usage with rollback and cleanup guarantees</li>
			</ul>
		</article>
	);
}
