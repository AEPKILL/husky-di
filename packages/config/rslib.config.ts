/**
 * @overview Shared Rslib configuration for publishable packages.
 * @author AEPKILL
 * @created 2025-06-23 23:47:22 22:15:00
 */

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
			redirect: { dts: { extension: true } },
		},
		{
			bundle: false,
			format: "cjs",
			syntax: ["node 18"],
		},
	],
});
