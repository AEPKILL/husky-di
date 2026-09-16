/**
 * @overview Proves each browser case owns fresh Node exposures and loopback listeners.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { expect, test } from "./fixtures";

test("each case starts with a clean Node and browser context", async ({
	page,
}) => {
	await page.goto("/legacy");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	const snapshot = await (await page.request.get("/api/lab")).json();
	expect(snapshot.peers).toHaveLength(1);
	expect(snapshot.globalExposure).toBe(true);
	await page.evaluate(() => localStorage.setItem("e2e-isolation", "dirty"));
});

test("the following case does not inherit browser storage or Node peers", async ({
	page,
}) => {
	await page.goto("/legacy");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	expect(
		await page.evaluate(() => localStorage.getItem("e2e-isolation")),
	).toBeNull();
	const snapshot = await (await page.request.get("/api/lab")).json();
	expect(snapshot.peers).toHaveLength(1);
	expect(snapshot.globalExposure).toBe(true);
});
