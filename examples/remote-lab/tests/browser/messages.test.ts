/**
 * @overview Verifies sent/received Network messages against real browser WebSocket traffic.
 * @author AEPKILL
 * @created 2026-09-11 06:58:25
 */

import { expect, test } from "./fixtures";

test("EXAMPLE-LAB-MESSAGES-001 toggles time order and preserves selection and sort across updates", async ({
	page,
}) => {
	await page.goto("/legacy");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	const timeHeader = page.locator(".message-table th[aria-sort]");
	const payload = page.locator(".network-grid .inspector .payload");
	const selectedPayload = await payload.innerText();
	await expect(timeHeader).toHaveAttribute("aria-sort", "ascending");
	await page.getByRole("button", { name: "Sort newest first" }).click();
	await expect(timeHeader).toHaveAttribute("aria-sort", "descending");
	await expect(payload).toHaveText(selectedPayload);
	await page.getByRole("button", { name: "Run quote", exact: true }).click();
	await expect(page.locator("#quote-result")).toHaveText("¥ 22.00");
	await page.getByLabel("Filter by direction").selectOption("received");
	await page.waitForResponse(
		(response) => new URL(response.url()).pathname === "/api/lab",
	);
	await page.getByRole("button", { name: "Call", exact: true }).click();
	await page.getByRole("button", { name: "Messages", exact: true }).click();
	await expect(timeHeader).toHaveAttribute("aria-sort", "descending");
	const receivedTimes = await page
		.locator(".message-table tbody time")
		.evaluateAll((elements) =>
			elements.map((element) =>
				Date.parse(element.getAttribute("datetime") ?? ""),
			),
		);
	expect(receivedTimes.length).toBeGreaterThan(1);
	expect(receivedTimes).toEqual(
		[...receivedTimes].sort((left, right) => right - left),
	);
	await page.getByRole("button", { name: "Sort oldest first" }).press("Enter");
	await expect(timeHeader).toHaveAttribute("aria-sort", "ascending");
	const ascendingTimes = await page
		.locator(".message-table tbody time")
		.evaluateAll((elements) =>
			elements.map((element) =>
				Date.parse(element.getAttribute("datetime") ?? ""),
			),
		);
	expect(ascendingTimes).toEqual(
		[...ascendingTimes].sort((left, right) => left - right),
	);
	await page.getByRole("button", { name: "Sort newest first" }).press("Space");
	await expect(timeHeader).toHaveAttribute("aria-sort", "descending");
});

test("EXAMPLE-LAB-MESSAGES-001 inspects actual messages by direction and keeps application calls available", async ({
	page,
}, testInfo) => {
	const sent: string[] = [];
	const received: string[] = [];
	page.on("websocket", (socket) => {
		if (!socket.url().endsWith("/rpc")) return;
		socket.on("framesent", ({ payload }) => sent.push(payload.toString()));
		socket.on("framereceived", ({ payload }) =>
			received.push(payload.toString()),
		);
	});
	await page.goto("/legacy");
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	await expect(
		page.getByRole("button", { name: "Messages", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
	const rows = page.locator(".message-table tbody tr");
	await expect(rows.locator('[data-owner="acceptor"]')).toHaveCount(0);
	await expect(
		rows.filter({ has: page.locator('[data-direction="sent"]') }).first(),
	).toBeVisible();
	await expect(
		page.locator('.message-table [data-message="fresh"]'),
	).toHaveAttribute("data-direction", "sent");
	await expect(
		page.locator('.message-table [data-message="accept"]'),
	).toHaveAttribute("data-direction", "received");
	await expect(
		page.locator('.message-table [data-message="peer-opened"]'),
	).toHaveCount(0);
	await page.getByRole("button", { name: "Run quote", exact: true }).click();
	await expect(page.locator("#quote-result")).toHaveText("¥ 22.00");
	await page.locator("#call-filter").fill("shipping.quote");
	await expect(rows).toHaveCount(1);
	await expect(rows).toHaveAttribute("data-direction", "sent");
	await rows.locator("td").last().click();
	const inspector = page.locator(".network-grid .inspector");
	const request = JSON.parse(await inspector.locator(".payload").innerText());
	expect(request.message).toMatchObject({ kind: "call", method: "quote" });
	await inspector.getByText("Raw JSON", { exact: true }).click();
	const raw = await inspector.locator(".raw-handshake").innerText();
	expect(sent).toContain(raw);
	await expect(rows).toContainText(`${Buffer.byteLength(raw)} B`);
	expect(await rows.locator("time").innerText()).toMatch(
		/\d{2}:\d{2}:\d{2}\.\d{3}/,
	);
	await page.getByLabel("Show Payload").uncheck();
	await expect(inspector.locator(".payload")).toContainText("hidden");
	await expect(inspector.locator(".raw-handshake")).toHaveCount(0);
	await expect(rows).not.toContainText("Shanghai");
	await page.getByLabel("Show Payload").check();

	await page.locator("#call-filter").fill("");
	const direction = page.getByLabel("Filter by direction");
	await direction.selectOption("received");
	await expect(
		page.locator('.message-table tbody tr[data-direction="sent"]'),
	).toHaveCount(0);
	const result = page.locator('.message-table [data-message="result"]').last();
	await result.getByRole("button").press("Enter");
	await expect(result).toHaveClass(/selected/);
	await inspector.getByText("Raw JSON", { exact: true }).click();
	expect(received).toContain(
		await inspector.locator(".raw-handshake").innerText(),
	);
	await direction.selectOption("sent");
	await expect(
		page.locator('.message-table tbody tr[data-direction="received"]'),
	).toHaveCount(0);
	await direction.selectOption("all");
	await page.locator("#side-filter").selectOption("Node");
	await expect(
		page.locator('.message-table tbody tr[data-side="Browser"]'),
	).toHaveCount(0);
	await expect(
		page.locator('.message-table tbody tr[data-side="Node"]').first(),
	).toBeVisible();
	await page.locator("#side-filter").selectOption("all");
	await page.locator("#call-filter").fill("shipping.quote");
	await expect(rows).toHaveCount(1);
	await rows.getByRole("button").press("Space");
	for (const width of [1024, 736, 360]) {
		await page.setViewportSize({ width, height: 900 });
		for (const theme of ["light", "dark"]) {
			await page.evaluate((value) => {
				document.documentElement.dataset.theme = value;
			}, theme);
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth),
			).toBeLessThanOrEqual(width);
			await expect(rows.locator("td").first()).toBeInViewport();
			await expect(rows.locator("time")).toBeInViewport();
			await page.screenshot({
				path: testInfo.outputPath(`messages-${width}-${theme}.png`),
			});
		}
	}
	await page.setViewportSize({ width: 1280, height: 900 });
	await direction.selectOption("sent");
	const handle = page.getByRole("separator", { name: "Resize Network panel" });
	await handle.press("ArrowLeft");
	const messageSize = await handle.getAttribute("aria-valuenow");
	await page.getByRole("button", { name: "Call", exact: true }).click();
	await expect(page.locator(".network-table tbody tr")).toHaveCount(2);
	await handle.press("ArrowRight");
	const callSize = await handle.getAttribute("aria-valuenow");
	await page.getByRole("button", { name: "Messages", exact: true }).click();
	await expect(direction).toHaveValue("sent");
	await expect(handle).toHaveAttribute("aria-valuenow", messageSize ?? "");
	await expect(rows).toHaveCount(1);
	await page.getByRole("button", { name: "Call", exact: true }).click();
	await expect(handle).toHaveAttribute("aria-valuenow", callSize ?? "");
});
