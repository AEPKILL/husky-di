/**
 * @overview Remote package Vitest configuration.
 * @author AEPKILL
 * @created 2026-08-11 21:07:13
 */

import { createVitestConfig } from "@husky-di/config/vitest";

export default createVitestConfig(import.meta.url, {
	test: {
		include: ["tests/**/*.test.ts"],
		exclude: ["tests/browser/**", "tests/types/**"],
	},
});
