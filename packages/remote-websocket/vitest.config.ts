/**
 * @overview Remote WebSocket package Vitest configuration.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createVitestConfig } from "@husky-di/config/vitest";

export default createVitestConfig(import.meta.url, {
	test: {
		exclude:
			process.env.WS_PACKAGE_TEST === "1"
				? []
				: ["tests/package.test.ts", "**/node_modules/**", "**/dist/**"],
	},
});
