/**
 * @overview Verifies the Observable stream lifecycle experiment in the browser workbench.
 * @author AEPKILL
 * @created 2026-09-13 23:08:57
 */

import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-STREAM-001 exposes independent, static, terminal and recovery controls", async ({
	page,
}) => {
	await page.goto("/legacy");
	await page.locator('[data-scenario="stream"]').click();
	const scene = page.locator('[data-scene="stream"]');
	await expect(scene).toBeVisible();
	await scene.locator("#stream-method").click();
	await scene.locator("#stream-method").click();
	await expect(
		page.locator('.network-table [data-message="stream-open"]'),
	).toHaveCount(2);
	await expect(
		page.locator('.network-table [data-message="stream-open"]').first(),
	).toContainText("STREAM");
	await scene.locator("#stream-next").click();
	await expect(
		scene.locator('.stream-card [data-stream-status="open"]'),
	).toHaveCount(2);
	await expect(
		page.locator('.network-table [data-message="stream-next"]'),
	).toHaveCount(2);
	await expect(scene.locator(".stream-card").first()).toContainText(
		"values: v1",
	);

	await scene.locator("#stream-static").click();
	await scene.locator("#stream-static").click();
	await expect(scene.locator(".stream-state")).toContainText("connected (2)");
	await scene.locator("#stream-unsubscribe").click();
	await expect(scene.locator('[data-stream-status="canceled"]')).toHaveCount(1);
	await expect(
		page.locator('.network-table [data-message="stream-cancel"]'),
	).toHaveCount(1);
	await scene.locator("#stream-complete").click();
	await expect(scene.locator('[data-stream-status="complete"]')).toHaveCount(3);
	await expect(
		page.locator('.network-table [data-message="stream-complete"]'),
	).toHaveCount(3);

	await scene.locator("#stream-reset").click();
	await scene.locator("#stream-method").click();
	await scene.locator("#stream-disconnect").click();
	await scene.locator("#stream-next").click();
	await expect(scene.locator(".stream-state")).toContainText("retained 1 / 4");
	await expect(
		page.locator('.network-table [data-message="stream-disconnect"]'),
	).toHaveCount(1);
	await scene.locator("#stream-recover").click();
	await expect(scene.locator(".stream-card").first()).toContainText(
		"values: v1",
	);
	await expect(
		page.locator('.network-table [data-message="stream-recover"]'),
	).toHaveCount(1);
	await scene.locator("#stream-overflow").click();
	await expect(scene.locator('[data-stream-status="error"]')).toContainText(
		"error",
	);
	await expect(
		page.locator('.network-table [data-message="stream-error"]'),
	).toHaveCount(1);
});
