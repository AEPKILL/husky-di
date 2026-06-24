/**
 * Root route for the documentation website.
 *
 * @overview
 * Provides the shared document shell, top-level navigation, and global page
 * chrome for all documentation routes in the TanStack Start app.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";

import appCss from "@/styles/app.css?url";

const primaryLinks = [
	{
		label: "Overview",
		to: "/" as const,
	},
	{
		label: "Guides",
		to: "/guides" as const,
	},
	{
		label: "Reference",
		to: "/reference" as const,
	},
];

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Husky DI Docs",
			},
			{
				name: "description",
				content: "TanStack Start powered documentation workspace for Husky DI.",
			},
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<div className="site-shell">
					<header className="site-header">
						<div className="site-header__brand">
							<p className="site-header__eyebrow">husky-di</p>
							<h1 className="site-header__title">Documentation Workspace</h1>
							<p className="site-header__subtitle">
								File-based docs app for guides, reference pages, and ADR-driven
								knowledge capture.
							</p>
						</div>
						<nav className="site-nav" aria-label="Primary">
							{primaryLinks.map((item) => (
								<Link
									key={item.to}
									to={item.to}
									activeOptions={{ exact: item.to === "/" }}
									activeProps={{
										className: "site-nav__link site-nav__link--active",
									}}
									inactiveProps={{ className: "site-nav__link" }}
								>
									{item.label}
								</Link>
							))}
						</nav>
					</header>
					<main className="site-main">{children}</main>
				</div>
				<TanStackRouterDevtools position="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
}
