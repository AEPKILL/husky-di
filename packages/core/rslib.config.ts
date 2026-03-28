import { resolve } from "node:path";
import { defineConfig } from "@rslib/core";

export default defineConfig({
	source: {
		alias: {
			"@": resolve(__dirname, "src"),
		},
	},
	lib: [
		{
			format: "esm",
			syntax: ["node 18"],
			dts: true,
		},
		{
			format: "cjs",
			syntax: ["node 18"],
		},
	],
});
