/**
 * @overview Verifies real Remote Lab scenarios and DevTools through the browser interface.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
});

test("EXAMPLE-LAB-WORKBENCH-001 quote links actual caller and handler payloads across Network and Flow", async ({
	page,
}) => {
	await page.getByRole("button", { name: "执行 quote →", exact: true }).click();
	await expect(page.locator("#quote-result")).toContainText("22");
	await page.locator("#call-filter").fill("shipping.quote");
	const caller = page
		.locator(".network-table tr")
		.filter({ hasText: "outgoing · Browser" });
	await expect(caller).toHaveCount(1);
	await expect(caller).toContainText("fulfilled");
	await caller
		.getByRole("button", { name: "shipping.quote", exact: true })
		.click();
	await page.getByRole("button", { name: "Payload", exact: true }).click();
	await expect(page.locator(".inspector .payload").first()).toContainText(
		"上海",
	);
	await expect(page.locator(".inspector .payload").last()).toContainText(
		'"amount": 22',
	);
	await page.getByRole("button", { name: "Flow", exact: true }).click();
	const browser = page.locator(".flow-endpoint").filter({
		has: page.getByRole("heading", { name: "Browser / APP", exact: true }),
	});
	const node = page.locator(".flow-endpoint").filter({
		has: page.getByRole("heading", { name: "Node / APP", exact: true }),
	});
	await expect(browser).toContainText("outgoing · quote · fulfilled");
	await expect(node).toContainText("incoming · quote · fulfilled");
	await expect(page.locator(".protocol-sketch")).toContainText("非测量阶段");
	await page.getByLabel("显示示例参数").uncheck();
	await expect(page.locator(".flow-stage pre")).toHaveCount(0);
});

test("EXAMPLE-LAB-WORKBENCH-001 Sources resumes a canceled handler without replacing the caller outcome", async ({
	page,
}) => {
	await page.locator('[data-scenario="cancel"]').click();
	await page.locator("#report-delay").fill("0");
	await page.getByRole("button", { name: "启动并暂停", exact: true }).click();
	await expect(page.locator(".pause-banner")).toContainText("Paused");
	await page.getByRole("button", { name: "取消调用等待", exact: true }).click();
	await expect(page.locator("#report-result")).toContainText("canceled");
	await expect(
		page.locator(".property").filter({ hasText: "caller outcome" }),
	).toContainText("canceled");
	await expect(
		page.locator(".property").filter({ hasText: "signal.aborted" }),
	).toContainText("true");
	await page.locator('.sources-panel [data-debug="resume"]').click();
	await expect(page.locator(".pause-banner")).not.toContainText("Paused");
	await expect(
		page.locator(".property").filter({ hasText: "caller outcome" }),
	).toContainText("canceled");
	await expect(page.locator("#report-result")).toContainText("canceled");
	await page.getByRole("button", { name: "Network", exact: true }).click();
	await page.locator("#call-filter").fill("report");
	const caller = page
		.locator(".network-table tr")
		.filter({ hasText: "outgoing · Browser" });
	await expect(caller).toContainText("canceled");
	const handler = page
		.locator(".network-table tr")
		.filter({ hasText: "incoming · Node" });
	await expect(handler).toContainText("fulfilled");
});

test("EXAMPLE-LAB-DEBUG-001 failed pause admission releases report controls", async ({
	page,
}) => {
	await page.locator('[data-scenario="shutdown"]').click();
	// Dispatch in one browser turn so the real pending queue remains full before admission runs.
	await page.evaluate(() => {
		for (const selector of [
			"#capacity-run",
			'[data-scenario="cancel"]',
			"#report-pause",
		]) {
			document.querySelector<HTMLButtonElement>(selector)?.click();
		}
	});
	await expect(page.locator("#report-result")).toContainText("unavailable");
	await expect(page.locator("#report-start")).toBeEnabled();
	await expect(page.locator("#capacity-result")).toContainText("fulfilled");
	await page.locator("#report-delay").fill("0");
	await page.locator("#report-start").click();
	await expect(page.locator("#report-result")).toContainText("fulfilled");
});

test("EXAMPLE-LAB-DEBUG-001 early cancellation leaves a manual resume path for unresolved pause intent", async ({
	page,
}) => {
	await page.locator('[data-scenario="cancel"]').click();
	await page.locator("#report-delay").fill("0");
	await page.evaluate(() => {
		document.querySelector<HTMLButtonElement>("#report-pause")?.click();
		document.querySelector<HTMLButtonElement>("#report-cancel")?.click();
	});
	await expect(page.locator("#report-result")).toContainText("canceled");
	const resume = page.locator('.sources-panel [data-debug="resume"]');
	await expect(resume).toBeEnabled();
	await resume.click();
	await expect(page.locator("#report-start")).toBeEnabled();
	await expect(page.locator("#report-result")).toContainText("canceled");
	await page.locator("#report-start").click();
	await expect(page.locator("#report-result")).toContainText("fulfilled");
});

test("EXAMPLE-LAB-WORKBENCH-001 legal values round-trip while Date and remote errors retain their actual boundaries", async ({
	page,
}) => {
	await page.locator('[data-scenario="values"]').click();
	await page
		.getByRole("button", { name: "echo 合法 JSON", exact: true })
		.click();
	await expect(page.locator("#value-result")).toContainText("fulfilled");
	await expect(page.locator("#value-result")).toContainText(
		'"items": [1, true, null]',
	);
	await page.getByRole("button", { name: "Date", exact: true }).click();
	await expect(page.locator("#value-result")).toContainText("TypeError");
	await page.getByRole("button", { name: "Network", exact: true }).click();
	await page.locator("#call-filter").fill("echo");
	await page
		.locator(".network-table tr")
		.filter({ hasText: "TypeError" })
		.getByRole("button", { name: "lab.echo", exact: true })
		.click();
	await page.getByRole("button", { name: "Payload", exact: true }).click();
	await expect(page.locator(".inspector .payload").last()).toContainText(
		"TypeError",
	);
	await page.locator('[data-scenario="errors"]').click();
	for (const [control, code] of [
		["#handler-fail", "handler-failed"],
		["#unknown-service", "unknown-service"],
		["#unknown-method", "unknown-method"],
	]) {
		await page.locator(control).click();
		await expect(page.locator("#error-result")).toContainText(code);
		await expect(page.locator("#transport")).toHaveText("Live transport");
	}
});

test("EXAMPLE-LAB-WORKBENCH-001 two real browser Peers receive directed callbacks and retain independent exposure", async ({
	page,
	context,
}) => {
	await page.locator('[data-scenario="peers"]').click();
	const opening = context.waitForEvent("page");
	await page
		.getByRole("button", { name: "↗ 打开第二个浏览器 Peer", exact: true })
		.click();
	const second = await opening;
	await expect(second.locator("#transport")).toHaveText("Live transport");
	await expect(second.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	const ownId = (await page.locator("#peer-name").innerText()).split(" · ")[0];
	const secondId = (await second.locator("#peer-name").innerText()).split(
		" · ",
	)[0];
	expect(secondId).not.toBe(ownId);
	await expect(
		page.locator(`#peer-select option[value="${secondId}"]`),
	).toHaveCount(1);
	await page.locator("#peer-select").selectOption(secondId);
	await page.locator("#peer-message").fill("<b>directed browser callback</b>");
	await page.getByRole("button", { name: "定向回调", exact: true }).click();
	await expect(second.locator("#callback")).toHaveText(
		"<b>directed browser callback</b>",
	);
	await expect(second.locator("#callback b")).toHaveCount(0);
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	await page.locator("#peer-message").fill("shared browser message");
	await page
		.getByRole("button", { name: "群发所有 Peer", exact: true })
		.click();
	await expect(page.locator("#callback")).toHaveText("shared browser message");
	await expect(second.locator("#callback")).toHaveText(
		"shared browser message",
	);
	await page.locator('[data-scenario="exposure"]').click();
	const ownExposure = page
		.locator(".peer-exposure")
		.filter({ hasText: `${ownId} ·` });
	await ownExposure
		.getByRole("button", { name: "撤销此 Peer", exact: true })
		.click();
	await expect(ownExposure).toContainText("inspect revoked");
	await page
		.getByRole("button", { name: "调用本 Peer inspect", exact: true })
		.click();
	await expect(page.locator("#exposure-result")).toContainText(
		"unknown-service",
	);
	await second.locator('[data-scenario="exposure"]').click();
	await second
		.getByRole("button", { name: "调用本 Peer inspect", exact: true })
		.click();
	await expect(second.locator("#exposure-result")).toContainText("fulfilled");
	await expect(second.locator("#exposure-result")).toContainText(secondId);
	await ownExposure
		.getByRole("button", { name: "恢复此 Peer", exact: true })
		.click();
	await page
		.getByRole("button", { name: "触发同名暴露冲突", exact: true })
		.click();
	await expect(page.locator("#exposure-result")).toContainText("TypeError");
	await page
		.getByRole("button", { name: "撤销全局 shipping", exact: true })
		.click();
	try {
		await expect(page.locator("#toggle-global")).toHaveText(
			"恢复全局 shipping",
		);
		await page
			.getByRole("button", { name: "调用 shipping.quote", exact: true })
			.click();
		await expect(page.locator("#exposure-result")).toContainText(
			"unknown-service",
		);
	} finally {
		await page
			.getByRole("button", { name: "恢复全局 shipping", exact: true })
			.click();
		await expect(page.locator("#toggle-global")).toHaveText(
			"撤销全局 shipping",
		);
	}
	await page
		.getByRole("button", { name: "调用 shipping.quote", exact: true })
		.click();
	await expect(page.locator("#exposure-result")).toContainText("fulfilled");
	await second.close();
});

test("EXAMPLE-LAB-RECOVERY-001 physical replacement preserves the report and a single handler entry", async ({
	page,
}) => {
	const peer = await page.locator("#peer-name").innerText();
	await page.locator('[data-scenario="recovery"]').click();
	await expect(page.locator("#handler-entries")).toHaveText("0");
	const replacement = page.waitForEvent("websocket", {
		predicate: (socket) => new URL(socket.url()).pathname === "/rpc",
	});
	await page
		.getByRole("button", { name: "启动 3 秒报表后断线", exact: true })
		.click();
	await replacement;
	await expect(page.locator("#report-result")).toContainText("fulfilled");
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#peer-name")).toHaveText(peer);
	await expect(page.locator("#handler-entries")).toHaveText("1");
});

test("EXAMPLE-LAB-RECOVERY-001 blocked replacement expires with the admitted report outcome unknown", async ({
	page,
}) => {
	await page.locator('[data-scenario="recovery"]').click();
	await page
		.getByRole("button", { name: "阻断重连 · 5 秒恢复到期", exact: true })
		.click();
	await expect(page.locator("#transport")).toHaveText("Transport disconnected");
	await expect(page.locator("#handler-entries")).toHaveText("1");
	await expect(page.locator("#transport")).toHaveText("Connection closed");
	await expect(page.locator("#report-result")).toContainText("outcome-unknown");
	await page.getByRole("button", { name: "允许后续重连", exact: true }).click();
	await expect(page.locator("#transport")).toHaveText("Connection closed");
	await expect(page.locator("#report-result")).toContainText("outcome-unknown");
});

for (const [mode, code] of [
	["Graceful shutdown", "fulfilled"],
	["Forced close", "outcome-unknown"],
]) {
	test(`EXAMPLE-LAB-TERMINATE-001 ${mode} stops polling and preserves the actual admitted result`, async ({
		page,
	}) => {
		await page.locator('[data-scenario="cancel"]').click();
		await page.locator("#report-delay").fill("2000");
		await page.getByRole("button", { name: "启动长任务", exact: true }).click();
		await expect(page.locator("#handler-entries")).toHaveText("1");
		await page.locator('[data-scenario="shutdown"]').click();
		await page.getByRole("button", { name: mode, exact: true }).click();
		if (mode === "Graceful shutdown")
			await expect(page.locator("#transport")).toHaveText("Disconnecting");
		await expect(page.locator("#node-state")).toContainText(
			"HTTP polling stopped",
		);
		await expect(page.locator("#transport")).toHaveText("Connection closed");
		await expect(page.locator("#report-result")).toContainText(code);
		await expect(
			page.getByRole("button", { name: "重新加载", exact: true }),
		).toBeVisible();
	});
}

test("EXAMPLE-LAB-WORKBENCH-001 capacity controls expose actual per-call admission outcomes", async ({
	page,
}) => {
	await page.locator('[data-scenario="shutdown"]').click();
	await page.locator("#capacity-run").click();
	await expect(page.locator("#capacity-result")).toContainText("fulfilled");
	await expect(page.locator("#capacity-result")).toContainText("unavailable");
	expect(
		(await page.locator("#capacity-result").innerText()).split("\n"),
	).toHaveLength(12);
	await expect(page.locator("#transport")).toHaveText("Live transport");
});

for (const width of [360, 736, 1024]) {
	for (const colorScheme of ["light", "dark"] as const) {
		test(`EXAMPLE-LAB-WORKBENCH-001 ${width}px ${colorScheme} workbench panels stay within the viewport`, async ({
			page,
		}, testInfo) => {
			await page.setViewportSize({ width, height: 900 });
			await page.emulateMedia({ colorScheme });
			await page
				.getByRole("button", { name: "切换深浅主题", exact: true })
				.click();
			await page
				.getByRole("button", { name: "切换深浅主题", exact: true })
				.click();
			await expect(page.locator("html")).toHaveAttribute(
				"data-theme",
				colorScheme,
			);
			await page
				.getByRole("button", { name: "执行 quote →", exact: true })
				.click();
			await expect(page.locator("#quote-result")).toHaveText("¥ 22.00");
			for (const scenario of [
				"unary",
				"cancel",
				"recovery",
				"peers",
				"exposure",
				"values",
				"errors",
				"shutdown",
				"adapter",
			]) {
				await page.locator(`[data-scenario="${scenario}"]`).click();
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth),
					scenario,
				).toBeLessThanOrEqual(width);
			}
			await page.locator('[data-scenario="unary"]').click();
			for (const panel of [
				"Network",
				"Flow",
				"Sources",
				"Services",
				"Console",
			]) {
				await page.getByRole("button", { name: panel, exact: true }).click();
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth),
					panel,
				).toBeLessThanOrEqual(width);
			}
			await page.getByRole("button", { name: "Network", exact: true }).click();
			await page.screenshot({
				path: testInfo.outputPath(`workbench-${width}-${colorScheme}.png`),
				fullPage: true,
			});
		});
	}
}
