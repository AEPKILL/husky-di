/**
 * @overview Remote package cross-browser release test configuration.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/browser",
	forbidOnly: Boolean(process.env.CI),
	reporter: "line",
	outputDir: "../../temp/remote-playwright",
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
	],
});
