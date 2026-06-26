/**
 * @overview Homepage route for the minimal Husky DI website.
 * @author AEPKILL
 * @created 2026-06-26 10:20:00
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	return (
		<section className="home-page">
			<div className="home-page__intro">
				<p className="eyebrow">Type-Safe Dependency Injection</p>
				<h2 className="home-page__title">
					Husky DI keeps object graphs explicit, testable, and predictable.
				</h2>
				<p className="home-page__body">
					This site is intentionally reduced to a single homepage. The extra
					documentation routes, demo components, and content scaffolding have
					been removed so the workspace stays easy to understand and extend.
				</p>
			</div>
			<div className="home-page__panel">
				<p className="home-page__label">Core packages</p>
				<ul className="home-page__list">
					<li>
						<code>@husky-di/core</code> for container and resolution behavior.
					</li>
					<li>
						<code>@husky-di/decorator</code> for constructor injection metadata.
					</li>
					<li>
						<code>@husky-di/module</code> for module-style composition
						boundaries.
					</li>
				</ul>
			</div>
			<div className="home-page__panel">
				<p className="home-page__label">What remains here</p>
				<p className="home-page__body">
					A TanStack Start app shell, one route, one stylesheet, and the base
					path helper needed for deployment under a subdirectory.
				</p>
			</div>
		</section>
	);
}
