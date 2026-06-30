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
				title: "Husky DI | Deterministic Dependency Injection",
			},
			{
				name: "description",
				content:
					"Type-safe and deterministic dependency injection for TypeScript with explicit registration, clear diagnostics, and composable container boundaries.",
			},
		],
		links: [
			{ rel: "icon", href: faviconHref, type: "image/svg+xml" },
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap",
			},
		],
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
