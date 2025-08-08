import fs from "node:fs";
import { resolve } from "node:path";
import { esbuildDecorators } from "@anatine/esbuild-decorators";
import { defineConfig } from "vitest/config";

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
	plugins: [
		esbuildDecorators({
			tsconfig: resolve(__dirname, "./tsconfig.json"),
			cwd: resolve(__dirname, "./"),
		}),
	],
	esbuild: {
		tsconfigRaw: fs.readFileSync(
			resolve(__dirname, "./tsconfig.json"),
			"utf-8",
		),
	},
});
