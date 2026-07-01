/**
 * TanStack Start website build configuration.
 *
 * @overview
 * Configures the husky-di documentation website with TanStack Start's
 * file-based routing plugin and React integration on top of Vite.
 *
 * @author AEPKILL
 * @created 2026-06-25 16:25:00
 */

import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const mdxPlugin = {
	...mdx(),
	enforce: "pre" as const,
};

function getWebsiteBasePath(): string {
	const configuredBasePath = process.env.WEBSITE_BASE_PATH?.trim();

	if (!configuredBasePath || configuredBasePath === "/") {
		return "/";
	}

	const normalizedBasePath = configuredBasePath.startsWith("/")
		? configuredBasePath
		: `/${configuredBasePath}`;

	return normalizedBasePath.endsWith("/")
		? normalizedBasePath
		: `${normalizedBasePath}/`;
}

export default defineConfig({
	base: getWebsiteBasePath(),
	server: {
		port: 3000,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		mdxPlugin,
		tailwindcss(),
		tanstackStart({
			prerender: {
				enabled: true,
			},
			router: {
				routeFileIgnorePattern:
					"^(?:(?:.+/)?(?:components|hooks|utils|types|consts|styles)(?:/|$))",
			},
			srcDirectory: "src",
		}),
		viteReact({
			include: /\.(mdx|js|jsx|ts|tsx)$/,
		}),
	],
});
