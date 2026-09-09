/**
 * @overview Runs Remote Lab workbench evidence over its real browser and Node servers.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/browser",
	forbidOnly: Boolean(process.env.CI),
	workers: 1,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	reporter: "line",
	outputDir: "../../temp/remote-lab-playwright",
	use: {
		...devices["Desktop Chrome"],
		baseURL: "http://127.0.0.1:5173",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	webServer: {
		command: "pnpm start",
		url: "http://127.0.0.1:5173/health",
		reuseExistingServer: false,
		gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
	},
});
