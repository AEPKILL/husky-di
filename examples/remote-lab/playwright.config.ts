/**
 * @overview Runs the Lab browser workbench regression against per-case local environments.
 * @author AEPKILL
 * @created 2026-09-10 00:38:10
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
	retries: 0,
	use: {
		...devices["Desktop Chrome"],
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
});
