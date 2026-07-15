/**
 * @overview Shared Vitest configuration factory for workspace packages.
 * @author AEPKILL
 * @created 2026-07-15 22:15:00
 */

import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

export function createVitestConfig(configFileUrl, overrides = {}) {
	const baseConfiguration = defineConfig({
		test: {},
		resolve: {
			alias: {
				"@": fileURLToPath(new URL("./src", configFileUrl)),
			},
		},
	});

	return mergeConfig(baseConfiguration, defineConfig(overrides));
}
