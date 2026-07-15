/**
 * @overview Shared Rslib configuration for publishable packages.
 * @author AEPKILL
 * @created 2026-07-15 22:15:00
 */

import { defineConfig } from "@rslib/core";

const rslibConfiguration = defineConfig({
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

export default rslibConfiguration;
