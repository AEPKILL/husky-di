import fs from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { tsDecoratorPlugin } from "./plugins/ts-decorator.plugin";

export default defineConfig({
	// Configure Vitest (https://vitest.dev/config/)
	test: {
		environment: "node",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	plugins: [tsDecoratorPlugin()],
});
