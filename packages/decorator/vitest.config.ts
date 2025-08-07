import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// Configure Vitest (https://vitest.dev/config/)
	test: {
		environment: "node",
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
});
