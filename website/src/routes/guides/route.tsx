/**
 * Guides section layout route.
 *
 * @overview
 * Wraps all documentation guide pages with shared section navigation and
 * explanatory copy tailored for onboarding and narrative documentation.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

const guideLinks = [
	{
		label: "Guide Overview",
		to: "/guides" as const,
	},
	{
		label: "Getting Started",
		to: "/guides/getting-started" as const,
	},
	{
		label: "Writing Docs",
		to: "/guides/writing-docs" as const,
	},
];

export const Route = createFileRoute("/guides")({
	component: GuidesLayout,
});

function GuidesLayout() {
	return (
		<section className="docs-section">
			<header className="docs-section__header">
				<p className="eyebrow">Guides</p>
				<h2>Teach the mental model before the API surface.</h2>
				<p>
					Use this section for onboarding flows, conceptual explanations,
					migration notes, and task-focused walkthroughs.
				</p>
			</header>
			<div className="docs-layout">
				<aside className="docs-sidebar">
					<nav className="section-nav" aria-label="Guides">
						{guideLinks.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								activeOptions={{ exact: item.to === "/guides" }}
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
