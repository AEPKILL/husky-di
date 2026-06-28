import { defineConfig } from "@rslib/core";

export default defineConfig({
	resolve: {
		alias: {
			"@": "./src",
		},
	},
	output: {
		sourceMap: true,
	},
	lib: [
		{
			bundle: false,
			format: "esm",
			syntax: ["node 18"],
			dts: true,
		},
		{
			bundle: false,
			format: "cjs",
			syntax: ["node 18"],
		},
	],
});
