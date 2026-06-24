/**
 * Documentation landing page route.
 *
 * @overview
 * Introduces the Husky DI documentation workspace and points contributors to
 * the most important writing entry points.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { Link, createFileRoute } from "@tanstack/react-router";

const landingCards = [
	{
		description:
			"Explain how to get started, shape mental models, and onboard contributors.",
		title: "Guides",
		to: "/guides",
	},
	{
		description:
			"Capture stable APIs, contracts, and package-specific reference material.",
		title: "Reference",
		to: "/reference",
	},
];

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	return (
		<section className="hero">
			<div className="hero__copy">
				<p className="eyebrow">TanStack Start + File-Based Routing</p>
				<h2 className="hero__title">Write docs in the same repo where the code lives.</h2>
				<p className="hero__body">
					This website is a dedicated writing surface for Husky DI. Use it for
					narrative guides, package reference pages, migration notes, and
					architecture storytelling that benefits from a polished browsing
					experience.
				</p>
			</div>
			<div className="hero__actions">
				<Link className="button button--primary" to="/guides/getting-started">
					Open Writing Guide
				</Link>
				<Link className="button button--secondary" to="/reference/core">
					Browse Core Reference
				</Link>
			</div>
			<div className="card-grid">
				{landingCards.map((card) => (
					<Link key={card.to} className="card" to={card.to}>
						<h3>{card.title}</h3>
						<p>{card.description}</p>
					</Link>
				))}
			</div>
		</section>
	);
}
