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
import { getNormalizedWebsiteBasePath } from "./utils/base-path.util";

export function getRouter() {
	return createRouter({
		basepath: getNormalizedWebsiteBasePath(import.meta.env.BASE_URL),
		routeTree,
		defaultPreload: "intent",
		scrollRestoration: true,
	});
}
