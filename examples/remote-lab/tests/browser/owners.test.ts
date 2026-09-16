/**
 * @overview Exercises attributed owner information, stale observations and seven-panel responsive access.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-OWNER-001 includes custom definition methods and cleanup state from the shared directory", async ({
	page,
}) => {
	await page.goto("/legacy");
	await expect(page.locator("#transport")).toHaveText("Live transport");
	const snapshot = await (await page.request.get("/api/custom")).json();
	const saved = await (
		await page.request.post("/api/custom", {
			data: {
				instanceId: snapshot.instanceId,
				requestId: "owner-custom-save",
				action: "save",
				definition: {
					target: { scope: "node-global", instanceId: snapshot.instanceId },
					wireName: "owner.custom.evidence",
					methods: [
						{
							name: "inspect",
							behavior: "echo",
							valueJson: "null",
							delayMs: 0,
							cancelable: true,
						},
					],
				},
			},
		})
	).json();
	await page.request.post("/api/custom", {
		data: {
			instanceId: snapshot.instanceId,
			requestId: "owner-custom-expose",
			action: "expose",
			id: saved.id,
			revision: 1,
		},
	});
	await page
		.getByRole("tab", { name: "Acceptor / Connector", exact: true })
		.click();
	const details = page
		.getByRole("tabpanel", { name: "Acceptor / Connector", exact: true })
		.locator("details")
		.filter({
			has: page.locator("summary", {
				hasText: "Lab known services and exposures (read-only)",
			}),
		});
	await details.locator("summary").click();
	await expect(details).toContainText("owner.custom.evidence");
	await expect(details).toContainText("inspect (cancelable)");
	await expect(details).toContainText("node-global");
	await expect(details).toContainText("exposed");
});

test("EXAMPLE-LAB-OWNER-001 isolates Peer selection and distinguishes canceled RPC from paused APP work", async ({
	page,
	context,
}) => {
	await page.goto("/legacy");
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#peer-name")).toContainText("peer-");
	const other = await context.newPage();
	await other.goto("/legacy");
	await expect(other.locator("#peer-name")).toContainText("peer-");
	const otherId = (await other.locator("#peer-name").innerText()).split(
		" · ",
	)[0];
	await page
		.getByRole("tab", { name: "Acceptor / Connector", exact: true })
		.click();
	const owners = page.getByRole("tabpanel", {
		name: "Acceptor / Connector",
		exact: true,
	});
	await expect(
		owners.getByRole("option", { name: "All Peers (2)", exact: true }),
	).toHaveCount(1);
	await owners.getByLabel("Info Panel Peer").selectOption(otherId);
	await expect(
		owners.getByRole("region", { name: "Acceptor information" }),
	).toContainText(otherId);
	await page.getByRole("tab", { name: "Network", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Messages", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator(".network-table")).not.toContainText(otherId);
	await page.locator('[data-scenario="cancel"]').click();
	await page.locator("#report-delay").fill("0");
	await page.locator("#report-pause").click();
	await page
		.getByRole("tab", { name: "Acceptor / Connector", exact: true })
		.click();
	await owners.getByLabel("Info Panel Peer").selectOption("");
	await expect(
		owners.getByRole("heading", {
			name: "Node Acceptor · RPC Pending Calls · 1",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		owners.getByRole("heading", {
			name: "Browser Connector · RPC Pending Calls · 1",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		owners.getByRole("region", { name: "APP unfinished handlers" }),
	).toContainText("aborted=false");
	await page.locator("#clear-records").click();
	await expect(
		owners.getByRole("heading", {
			name: "Node Acceptor · RPC Pending Calls · 1",
			exact: true,
		}),
	).toBeVisible();
	await page.locator("#report-cancel").click();
	await expect(
		owners.getByRole("heading", {
			name: "Node Acceptor · RPC Pending Calls · 0",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		owners.getByRole("heading", {
			name: "Browser Connector · RPC Pending Calls · 0",
			exact: true,
		}),
	).toBeVisible();
	await expect(
		owners.getByRole("region", { name: "APP unfinished handlers" }),
	).toContainText("aborted=true");
	await page.locator("#report-resume").click();
	await expect(
		owners.getByRole("region", { name: "APP unfinished handlers" }),
	).not.toContainText("aborted=true");
	await other.locator('[data-scenario="shutdown"]').click();
	await other
		.getByRole("button", { name: "Graceful shutdown", exact: true })
		.click();
	await expect(
		owners.getByRole("option", { name: "All Peers (1)", exact: true }),
	).toHaveCount(1);
	await other
		.getByRole("tab", { name: "Acceptor / Connector", exact: true })
		.click();
	await expect(
		other.getByRole("region", { name: "Connector information" }),
	).toContainText('"status":"closed"');
});

test("EXAMPLE-LAB-OWNER-001 freezes Node pending timing when polling loses observation", async ({
	page,
}) => {
	await page.goto("/legacy");
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await page.locator('[data-scenario="cancel"]').click();
	await page.locator("#report-pause").click();
	await page
		.getByRole("tab", { name: "Acceptor / Connector", exact: true })
		.click();
	const node = page.getByRole("region", { name: "Acceptor information" });
	await expect(
		node.getByRole("heading", {
			name: "Node Acceptor · RPC Pending Calls · 1",
			exact: true,
		}),
	).toBeVisible();
	await page.route("**/api/snapshot", (route) => route.abort());
	await expect(node).toContainText("stale · stale snapshot");
	const observed = await node.innerText();
	// Boundary failure is injected only into observation; actual RPC remains alive.
	await page.waitForResponse((response) => response.url().endsWith("/api/lab"));
	await expect(node).toHaveText(observed, { useInnerText: true });
	await page.unroute("**/api/snapshot");
	await expect(node).not.toContainText("stale · stale snapshot");
	await page.locator("#report-resume").click();
});

test("EXAMPLE-LAB-DEVTOOLS-001 seven panels fit light and dark narrow layouts with keyboard tabs", async ({
	page,
}) => {
	await page.goto("/legacy");
	await expect(page.locator("#transport")).toHaveText("Live transport");
	for (const width of [360, 736, 1024]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ["light", "dark"]) {
			await page.evaluate((value) => {
				document.documentElement.dataset.theme = value;
			}, theme);
			for (const name of [
				"Network",
				"Flow",
				"Sources",
				"Services",
				"Console",
				"Acceptor / Connector",
				"E2E",
			]) {
				const tab = page.getByRole("tab", { name, exact: true });
				await tab.focus();
				await tab.press("Enter");
				await expect(tab).toHaveAttribute("aria-selected", "true");
				await expect(
					page.getByRole("tabpanel", { name, exact: true }),
				).toBeVisible();
				await expect
					.poll(() =>
						page.evaluate(
							() => document.documentElement.scrollWidth <= window.innerWidth,
						),
					)
					.toBe(true);
			}
		}
	}
});
