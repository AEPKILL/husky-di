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

import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: 3000,
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [
		tanstackStart({
			srcDirectory: "src",
		}),
		viteReact(),
	],
});
