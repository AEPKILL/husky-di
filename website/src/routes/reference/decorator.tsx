/**
 * Decorator reference route.
 *
 * @overview
 * Seeds the decorator package reference area with the concepts and contracts
 * most likely to need durable documentation.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reference/decorator")({
	component: DecoratorReferencePage,
});

function DecoratorReferencePage() {
	return (
		<article className="prose-card">
			<h3>`@husky-di/decorator` reference starter</h3>
			<ul>
				<li>`@injectable()` metadata consolidation behavior</li>
				<li>`@inject()` and `@tagged()` parameter metadata rules</li>
				<li>How `decoratorMiddleware` integrates with `globalMiddleware`</li>
				<li>Why the package supports TypeScript experimental decorators only</li>
				<li>Common structured error codes and failure conditions</li>
			</ul>
		</article>
	);
}
