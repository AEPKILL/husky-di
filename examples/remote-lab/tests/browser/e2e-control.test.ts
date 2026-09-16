/**
 * @overview Verifies the visible package E2E control and retained data-flow views.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-E2E-001/003 runs observable package scenarios and exposes their evidence", async ({
	page,
}) => {
	await page.goto("/legacy");
	await page.getByRole("tab", { name: "E2E", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Remote / WebSocket Observable Tests" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Run package E2E" }).click();
	const report = page.getByRole("region", { name: "E2E Run Report" });
	await expect(report).toHaveAttribute("data-run-status", "passed", {
		timeout: 20_000,
	});
	await expect(report).toContainText("@husky-di/remote");
	await expect(report).toContainText("packages/remote/");
	await expect(report.getByRole("button", { name: "Network" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(report).toContainText(/sent|received/);
	await report.getByRole("button", { name: "Flow", exact: true }).click();
	await expect(report).toContainText(/e2e:.*\.echo/);
	await report.getByRole("button", { name: "Console", exact: true }).click();
	await expect(report).toContainText(/browser|node/);
	await expect(
		report.locator("section[data-case-status] pre.payload"),
	).toContainText(/transport|TRANSPORT/i);
	await report.getByRole("button", { name: "Owner", exact: true }).click();
	await expect(report).toContainText("Session");
	await expect(report).toContainText(/peer-closed|connections 0/);
	await page.getByRole("tab", { name: "Network", exact: true }).click();
	const manualNetwork = page.getByRole("tabpanel", {
		name: "Network",
		exact: true,
	});
	await manualNetwork
		.getByRole("button", { name: "Call", exact: true })
		.click();
	const e2eCall = manualNetwork.locator('[data-call^="Node:"]').last();
	await expect(e2eCall).toBeVisible();
	await e2eCall.click();
	await manualNetwork
		.getByRole("tab", { name: "Overview", exact: true })
		.click();
	await expect(manualNetwork).toContainText("e2e:");
	await manualNetwork
		.getByRole("button", { name: "Messages", exact: true })
		.click();
	await expect(
		manualNetwork.locator('.message-table tbody tr[data-side="Node"]'),
	).not.toHaveCount(0);
});
