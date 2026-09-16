/**
 * @overview Decorator package Vitest configuration.
 * @author AEPKILL
 * @created 2025-06-23 23:47:22 22:15:00
 */

import { createVitestConfig } from "@husky-di/config/vitest";
import { tsDecoratorPlugin } from "./plugins/ts-decorator.plugin";

export default createVitestConfig(import.meta.url, {
	test: {
		environment: "node",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
	},
	plugins: [tsDecoratorPlugin()],
});
