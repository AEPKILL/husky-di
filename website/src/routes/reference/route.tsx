/**
 * Reference section layout route.
 *
 * @overview
 * Wraps API and package reference pages with a shared navigation model focused
 * on stable contracts and implementation boundaries.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

const referenceLinks = [
	{
		label: "Reference Overview",
		to: "/reference" as const,
	},
	{
		label: "Core",
		to: "/reference/core" as const,
	},
	{
		label: "Decorator",
		to: "/reference/decorator" as const,
	},
];

export const Route = createFileRoute("/reference")({
	component: ReferenceLayout,
});

function ReferenceLayout() {
	return (
		<section className="docs-section">
			<header className="docs-section__header">
				<p className="eyebrow">Reference</p>
				<h2>Record the stable contracts readers depend on.</h2>
				<p>
					Use reference pages for package boundaries, public APIs, behavioral
					rules, and precise terminology that should stay durable over time.
				</p>
			</header>
			<div className="docs-layout">
				<aside className="docs-sidebar">
					<nav className="section-nav" aria-label="Reference">
						{referenceLinks.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								activeOptions={{ exact: item.to === "/reference" }}
								activeProps={{
									className: "section-nav__link section-nav__link--active",
								}}
								inactiveProps={{ className: "section-nav__link" }}
							>
								{item.label}
							</Link>
						))}
					</nav>
				</aside>
				<div className="docs-content">
					<Outlet />
				</div>
			</div>
		</section>
	);
}
