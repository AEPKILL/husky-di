/**
 * @overview Root route for the minimal Husky DI website.
 * @author AEPKILL
 * @created 2026-06-26 10:20:00
 */

import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import "@/styles/app.css";

const faviconHref = `${import.meta.env.BASE_URL}favicon.svg`;

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
				title: "Husky DI",
			},
			{
				name: "description",
				content: "Minimal homepage for the Husky DI project website.",
			},
		],
		links: [{ rel: "icon", href: faviconHref, type: "image/svg+xml" }],
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
						<p className="site-header__eyebrow">husky-di</p>
						<h1 className="site-header__title">
							A small, focused project homepage.
						</h1>
						<p className="site-header__subtitle">
							The website workspace now ships a single landing page instead of a
							full documentation tree.
						</p>
					</header>
					<main className="site-main">{children}</main>
				</div>
				<Scripts />
			</body>
		</html>
	);
}
