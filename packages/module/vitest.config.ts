import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// Configure Vitest (https://vitest.dev/config/)
	test: {},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
});
