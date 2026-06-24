/**
 * Website router factory.
 *
 * @overview
 * Creates the TanStack Router instance used by the documentation website.
 * The route tree is generated from the file-based route structure.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
	return createRouter({
		routeTree,
		defaultPreload: "intent",
		scrollRestoration: true,
	});
}
