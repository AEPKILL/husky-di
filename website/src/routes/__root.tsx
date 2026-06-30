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
import "@/styles/globals.css";

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
				{children}
				<Scripts />
			</body>
		</html>
	);
}
