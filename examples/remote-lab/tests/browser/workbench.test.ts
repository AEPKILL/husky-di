/**
 * @overview Verifies real Remote Lab scenarios and DevTools through the browser interface.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import assert from "node:assert/strict";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	LabHandshakeKindEnum,
	LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";
import type { LabServerSnapshot } from "@/types/lab-server.type";

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
});

test("EXAMPLE-LAB-HANDSHAKE-001 Network selects and filters both endpoints' safe handshake observations", async ({
	page,
}, testInfo) => {
	await expect(page.locator(".logo svg.lucide-flask-conical")).toBeVisible();
	await expect(page.locator(".brand strong")).toHaveText("remote lab");
	const peerId = (await page.locator("#peer-name").innerText()).split(" · ")[0];
	await page.locator("#call-filter").fill("Handshake");
	const opened = page.locator('.network-table [data-handshake="peer-opened"]');
	const browser = opened.filter({ hasText: "Browser · this-browser ·" });
	const node = opened.filter({ hasText: `Node · ${peerId} ·` });
	await expect(browser).toHaveCount(1);
	await expect(node).toHaveCount(1);
	await expect(browser.locator('[data-owner="connector"]')).toHaveText(
		"Connector",
	);
	await expect(node.locator('[data-owner="acceptor"]')).toHaveText("Acceptor");
	const inspector = page.locator(".network-grid .inspector");
	for (const [row, side, peer, key] of [
		[browser, "Browser", "this-browser", undefined],
		[node, "Node", peerId, "Enter"],
		[browser, "Browser", "this-browser", "Space"],
	] as const) {
		if (key)
			await row
				.getByRole("button", { name: "Handshake · peer-opened", exact: true })
				.press(key);
		else await row.locator(".outcome").click();
		await expect(row).toHaveClass("selected");
		await expect(row.locator(".call-link")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(
			page.locator('.network-table [aria-pressed="true"]'),
		).toHaveCount(1);
		for (const [name, value] of [
			["Source", "RPC · Owner event$"],
			["Event", "peer-opened"],
			["Side", side],
			["Peer", peer],
			["Outcome", "fulfilled"],
			["Close reason", "—"],
		]) {
			await expect(
				inspector
					.locator(".property")
					.filter({ has: page.getByText(name, { exact: true }) })
					.locator(".mono"),
			).toHaveText(value);
		}
	}
	await expect(inspector).toContainText("Observed at");
	await expect(inspector).toContainText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	await expect(inspector).toContainText("未测量握手耗时");
	await expect(inspector.locator(".payload")).toHaveCount(0);
	await expect(browser.locator(".waterfall-bar")).toHaveCount(0);
	const metadata = await inspector.innerText();
	await page.getByLabel("显示示例参数").uncheck();
	await expect(inspector).toHaveText(metadata, { useInnerText: true });
	await page.locator("#side-filter").selectOption("Browser");
	await page.locator("#call-filter").fill("握手");
	await expect(browser).toHaveCount(1);
	await expect(page.locator(".network-table [data-handshake]")).toHaveCount(3);
	for (const filter of ["peer-opened", "this-browser"]) {
		await page.locator("#call-filter").fill(filter);
		await expect(page.locator(".network-table tbody tr")).toHaveCount(1);
		await expect(browser).toHaveCount(1);
	}
	await page.locator("#status-filter").selectOption("pending");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(0);
	await page.locator("#status-filter").selectOption("fulfilled");
	await expect(browser).toHaveCount(1);
	await page.locator("#call-filter").fill(peerId);
	await page.locator("#side-filter").selectOption("Node");
	await expect(node).toHaveCount(1);
	await expect(browser).toHaveCount(0);
	await node.locator(".outcome").click();
	for (const width of [1280, 360]) {
		await page.setViewportSize({ width, height: 900 });
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(width);
		await expect(inspector).toBeInViewport();
		await page.screenshot({
			path: testInfo.outputPath(`handshake-${width}.png`),
			fullPage: true,
		});
	}
	await page.locator("#clear-records").click();
	await page.locator("#call-filter").fill("handshake");
	await page.locator("#side-filter").selectOption("Browser");
	await expect(page.locator(".network-table [data-handshake]")).toHaveCount(0);
	await page.locator("#side-filter").selectOption("Node");
	await expect(page.locator(".network-table [data-handshake]")).toHaveCount(0);
});

test("EXAMPLE-LAB-HANDSHAKE-001 complete fresh handshake payloads match real WebSocket frames on both endpoints", async ({
	page,
}) => {
	const wire = captureHandshakeFrames(page);
	await page.reload();
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	await page.locator("#side-filter").selectOption("Browser");
	await page.locator("#call-filter").fill("fresh");
	const freshRow = page.locator(
		'.network-table [data-handshake="fresh"][data-direction="sent"]',
	);
	const fresh = await readHandshakePayload(page, freshRow);
	expect(fresh).toEqual(wire.sent.find((frame) => frame.kind === "fresh"));
	expect(Object.keys(fresh).sort()).toEqual(["kind", "profiles"]);
	await expect(freshRow.locator(".outcome")).toHaveText("fulfilled");
	await page.locator("#call-filter").fill("accept");
	const acceptRow = page.locator(
		'.network-table [data-handshake="accept"][data-direction="received"]',
	);
	const accept = await readHandshakePayload(page, acceptRow);
	expect(accept).toEqual(
		wire.received.find((frame) => frame.kind === "accept"),
	);
	expect(Object.keys(accept).sort()).toEqual([
		"bindingEpoch",
		"kind",
		"profile",
		"resumeToken",
		"sessionId",
	]);
	expect(accept.bindingEpoch).toBe(1);
	expect(accept.resumeToken).toEqual(expect.any(String));
	expect(String(accept.resumeToken).length).toBeGreaterThan(0);
	expect(fresh.profiles).toEqual([accept.profile]);
	const inspector = page.locator(".network-grid .inspector");
	const payload = inspector.locator(".payload");
	await expect(payload.locator("*")).toHaveCount(0);
	expect(await payload.innerText()).toBe(JSON.stringify(accept, null, 2));
	await inspector.getByText("Raw JSON", { exact: true }).click();
	expect(
		JSON.parse(await inspector.locator(".raw-handshake").innerText()),
	).toEqual(accept);
	await page.getByLabel("显示示例参数").uncheck();
	await expect(payload).toHaveText("Payload hidden / 已隐藏握手报文");
	await expect(inspector.getByText("Raw JSON", { exact: true })).toHaveCount(0);
	await page.getByLabel("显示示例参数").check();
	expect(JSON.parse(await payload.innerText())).toEqual(accept);
	await page.getByRole("tab", { name: "Overview", exact: true }).click();
	for (const [name, value] of [
		["Source", "TRANSPORT · Adapter boundary"],
		["Frame", "accept"],
		["Side", "Browser"],
		["Direction", "received"],
		["Outcome", "fulfilled"],
	]) {
		await expect(
			inspector
				.locator(".property")
				.filter({ has: page.getByText(name, { exact: true }) })
				.locator(".mono"),
		).toHaveText(value);
	}
	await expect(inspector).toContainText(/Browser-connection-\d+/);
	await expect(inspector).toContainText(/\d+ B/);
	await page.getByRole("tab", { name: "Timing", exact: true }).click();
	await expect(inspector).toContainText("Observed at");
	await expect(inspector).toContainText("未测量完整握手耗时");
	await page.locator("#side-filter").selectOption("Node");
	const nodeAccept = page.locator(
		'.network-table [data-handshake="accept"][data-direction="sent"]',
	);
	await expect(nodeAccept).toHaveCount(1);
	expect(await readHandshakePayload(page, nodeAccept)).toEqual(accept);
	const connectionId = (
		await nodeAccept.locator(".request-meta").innerText()
	).match(/Node-connection-\d+/)?.[0];
	assert(connectionId, "Node accept must identify its observed connection");
	await page.locator("#call-filter").fill(connectionId);
	const nodeFresh = page.locator(
		'.network-table [data-handshake="fresh"][data-direction="received"]',
	);
	expect(await readHandshakePayload(page, nodeFresh)).toEqual(fresh);
});

test("EXAMPLE-LAB-NETWORK-001 each tab retains only its own Connector and Acceptor communication across reload and clear", async ({
	page,
	context,
}) => {
	const ownAccept = await readHandshakePayload(
		page,
		page.locator('[data-handshake="accept"][data-direction="received"]'),
	);
	const second = await context.newPage();
	await second.goto("/");
	await expect(second.locator("#transport")).toHaveText("Live transport");
	await expect(second.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	const secondAccept = await readHandshakePayload(
		second,
		second.locator('[data-handshake="accept"][data-direction="received"]'),
	);
	expect(secondAccept.sessionId).not.toBe(ownAccept.sessionId);
	for (const [tab, origin] of [
		[page, "first-tab-origin"],
		[second, "second-tab-origin"],
	] as const) {
		await tab.locator("#from").fill(origin);
		await tab
			.getByRole("button", { name: "执行 quote →", exact: true })
			.click();
		await expect(tab.locator("#quote-result")).toHaveText("¥ 22.00");
	}
	for (const [tab, origin, otherOrigin, sessionId] of [
		[page, "first-tab-origin", "second-tab-origin", ownAccept.sessionId],
		[second, "second-tab-origin", "first-tab-origin", secondAccept.sessionId],
	] as const) {
		await tab.waitForResponse(
			(response) => new URL(response.url()).pathname === "/api/lab",
		);
		await tab.locator("#call-filter").fill("shipping.quote");
		const rows = tab.locator(".network-table tbody tr");
		await expect(rows).toHaveCount(2);
		for (const side of ["Browser", "Node"]) {
			const row = rows.filter({ hasText: `${side} ·` });
			await expect(row).toHaveCount(1);
			await row.locator(".outcome").click();
			const argumentsPreview = tab.locator(".inspector .payload").first();
			await expect(argumentsPreview).toContainText(origin);
			await expect(argumentsPreview).not.toContainText(otherOrigin);
		}
		await expectNetworkSession(tab, sessionId);
	}
	await page.locator('[data-scenario="peers"]').click();
	const secondId = (await second.locator("#peer-name").innerText()).split(
		" · ",
	)[0];
	await page.locator("#peer-select").selectOption(secondId);
	await page
		.locator("#peer-message")
		.fill("only the second connection receives this");
	await page.getByRole("button", { name: "定向回调", exact: true }).click();
	await expect(second.locator("#callback")).toHaveText(
		"only the second connection receives this",
	);
	for (const tab of [page, second]) {
		await tab.locator("#side-filter").selectOption("all");
		await tab.locator("#call-filter").fill("lab-browser.receive");
		await tab.waitForResponse(
			(response) => new URL(response.url()).pathname === "/api/lab",
		);
	}
	await expect(page.locator(".network-table tbody tr")).toHaveCount(0);
	await expect(second.locator(".network-table tbody tr")).toHaveCount(2);
	await expect(
		second.locator(".network-table tbody tr").filter({ hasText: "Node ·" }),
	).toHaveCount(1);
	await page.reload();
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	const reloadedAccept = await readHandshakePayload(
		page,
		page.locator('[data-handshake="accept"][data-direction="received"]'),
	);
	expect(reloadedAccept.sessionId).not.toBe(ownAccept.sessionId);
	await page.locator("#call-filter").fill("shipping.quote");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(0);
	await expectNetworkSession(page, reloadedAccept.sessionId);
	await page.locator("#clear-records").click();
	await expect(page.locator(".network-table tbody tr")).toHaveCount(0);
	await page.locator("#side-filter").selectOption("Browser");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(0);
	await second.locator("#call-filter").fill("shipping.quote");
	await expect(second.locator(".network-table tbody tr")).toHaveCount(1);
	await expect(second.locator(".network-table tbody tr")).toContainText(
		"Browser ·",
	);
	await second.locator("#side-filter").selectOption("Node");
	await second.locator("#call-filter").fill("handshake");
	await expect(second.locator(".network-table tbody tr")).toHaveCount(0);
	await second.locator("#side-filter").selectOption("Browser");
	await expect(second.locator(".network-table [data-handshake]")).toHaveCount(
		3,
	);
	expect(
		(
			await readHandshakePayload(
				second,
				second.locator('[data-handshake="accept"]'),
			)
		).sessionId,
	).toBe(secondAccept.sessionId);
	await second.close();
});

test("EXAMPLE-LAB-CLEAR-001 clear all removes both endpoints' history and Console while retaining the live connection", async ({
	page,
}) => {
	const peer = await page.locator("#peer-name").innerText();
	let newConnections = 0;
	page.on("websocket", (socket) => {
		if (new URL(socket.url()).pathname === "/rpc") newConnections += 1;
	});
	await page.getByRole("button", { name: "执行 quote →", exact: true }).click();
	await expect(page.locator("#quote-result")).toHaveText("¥ 22.00");
	await page.locator("#call-filter").fill("shipping.quote");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(2);
	await page.getByRole("tab", { name: "Console", exact: true }).click();
	for (const side of ["Browser", "Node"]) {
		await expect(
			page.locator(".rpc-diagnostics h3").filter({ hasText: `${side} ·` }),
		).toContainText(/[1-9]\d* events/);
		await expect(
			page
				.locator(".console-panel .console-line")
				.filter({ hasText: side })
				.first(),
		).toBeVisible();
	}
	await page.getByRole("button", { name: "清空全部记录", exact: true }).click();
	await expect(page.locator(".console-line")).toHaveCount(0);
	for (const side of ["Browser", "Node"]) {
		await expect(
			page.locator(".rpc-diagnostics h3").filter({ hasText: `${side} ·` }),
		).toHaveText(`${side} · 0 RPC pending · 0 events`);
	}
	await page.getByRole("tab", { name: "Network", exact: true }).click();
	await page.locator("#call-filter").clear();
	for (let poll = 0; poll < 2; poll += 1) {
		await page.waitForResponse(
			(response) => new URL(response.url()).pathname === "/api/lab",
		);
		await expect(page.locator(".network-table tbody tr")).toHaveCount(0);
		await expect(page.locator(".console-line")).toHaveCount(0);
	}
	await page.locator("#from").fill("after-clear");
	await page.getByRole("button", { name: "执行 quote →", exact: true }).click();
	await page.locator("#call-filter").fill("shipping.quote");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(2);
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#peer-name")).toHaveText(peer);
	expect(newConnections).toBe(0);
});

test("EXAMPLE-LAB-CLEAR-001 failed clear preserves history and retry ignores a delayed earlier poll", async ({
	page,
}) => {
	await page.getByRole("button", { name: "执行 quote →", exact: true }).click();
	await expect(page.locator("#quote-result")).toHaveText("¥ 22.00");
	await page.locator("#call-filter").fill("shipping.quote");
	const rows = page.locator(".network-table tbody tr");
	await expect(rows).toHaveCount(2);
	const heldPoll = Promise.withResolvers<void>();
	const releasePoll = Promise.withResolvers<void>();
	const retryStarted = Promise.withResolvers<void>();
	const releaseRetry = Promise.withResolvers<void>();
	let holdNextPoll = true;
	let clearRequests = 0;
	await page.route("**/api/lab", async (route) => {
		const response = await route.fetch();
		if (holdNextPoll) {
			holdNextPoll = false;
			heldPoll.resolve();
			await releasePoll.promise;
		}
		await route.fulfill({ response });
	});
	await page.route("**/api/lab/records", async (route) => {
		clearRequests += 1;
		if (clearRequests === 1) {
			await route.fulfill({ status: 500, json: { error: "clear failed" } });
			return;
		}
		retryStarted.resolve();
		await releaseRetry.promise;
		await route.continue();
	});
	await heldPoll.promise;
	const clear = page.getByRole("button", { name: "清空全部记录", exact: true });
	try {
		await clear.click();
		await expect(page.locator("#notice")).toHaveText("清空记录失败，请重试。");
		await expect(rows).toHaveCount(2);
		await expect(clear).toBeEnabled();
		await clear.click();
		await retryStarted.promise;
		await expect(clear).toBeDisabled();
		releaseRetry.resolve();
		await expect(rows).toHaveCount(0);
		await expect(clear).toBeEnabled();
		expect(clearRequests).toBe(2);
		const staleResponse = page.waitForResponse(
			(response) => new URL(response.url()).pathname === "/api/lab",
		);
		releasePoll.resolve();
		await (await staleResponse).finished();
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
		);
		expect(await rows.count()).toBe(0);
		expect(await page.locator(".console-line").count()).toBe(0);
		await page.waitForResponse(
			(response) => new URL(response.url()).pathname === "/api/lab",
		);
		await expect(rows).toHaveCount(0);
	} finally {
		releasePoll.resolve();
		releaseRetry.resolve();
	}
});

test("EXAMPLE-LAB-CLEAR-001 shutdown supersedes an earlier clear response and permits a later clear", async ({
	page,
}) => {
	await page.locator('[data-scenario="cancel"]').click();
	await page.locator("#report-delay").fill("5000");
	await page.getByRole("button", { name: "启动长任务", exact: true }).click();
	await expect(page.locator("#handler-entries")).toHaveText("1");
	const clearedOnNode = Promise.withResolvers<void>();
	const releaseResponse = Promise.withResolvers<void>();
	await page.route("**/api/lab/records", async (route) => {
		const response = await route.fetch();
		clearedOnNode.resolve();
		await releaseResponse.promise;
		await route.fulfill({ response });
	});
	const clear = page.getByRole("button", { name: "清空全部记录", exact: true });
	try {
		await clear.click();
		await clearedOnNode.promise;
		await page.locator('[data-scenario="shutdown"]').click();
		await page
			.getByRole("button", { name: "Forced close", exact: true })
			.click();
		await expect(page.locator("#transport")).toHaveText("Connection closed");
		await expect(page.locator("#report-result")).toContainText(
			"outcome-unknown",
		);
		await expect(page.locator("#notice")).toHaveText(
			"Session closed. Reload to create a new Session.",
		);
		await page.getByRole("tab", { name: "Network", exact: true }).click();
		await page.locator("#call-filter").fill("report");
		await page.locator("#side-filter").selectOption("Browser");
		const rows = page.locator(".network-table tbody tr");
		await expect(rows).toHaveCount(1);
		await expect(rows.locator(".outcome")).toHaveText("outcome-unknown");
		const delivered = page.waitForResponse(
			(response) => new URL(response.url()).pathname === "/api/lab/records",
		);
		releaseResponse.resolve();
		await (await delivered).finished();
		await expect(clear).toBeEnabled();
		await expect(rows).toHaveCount(1);
		await expect(rows.locator(".outcome")).toHaveText("outcome-unknown");
		await expect(page.locator("#notice")).toHaveText(
			"Session closed. Reload to create a new Session.",
		);
		await page.unroute("**/api/lab/records");
		await expect
			.poll(async () => {
				const snapshot = (await (
					await page.request.get("/api/lab")
				).json()) as LabServerSnapshot;
				return snapshot.recording.calls.filter(
					(call) => call.outcome === "pending",
				).length;
			})
			.toBe(0);
		await clear.click();
		await expect(page.locator("#notice")).toHaveText(
			"已清空全部记录；在途调用保留。",
		);
		await expect(rows).toHaveCount(0);
		await page.locator("#call-filter").clear();
		await page.locator("#side-filter").selectOption("Node");
		await expect(rows).toHaveCount(0);
		await page.getByRole("tab", { name: "Console", exact: true }).click();
		await expect(
			page.locator(".rpc-diagnostics h3").filter({ hasText: "Node ·" }),
		).toHaveText("Node · 0 RPC pending · 0 events");
		await expect(page.locator("#transport")).toHaveText("Connection closed");
	} finally {
		releaseResponse.resolve();
	}
});

test("EXAMPLE-LAB-NETWORK-001 a different server cannot reuse the current Peer and selected record identities", async ({
	page,
}) => {
	await page.getByRole("button", { name: "执行 quote →", exact: true }).click();
	await expect(page.locator("#quote-result")).toHaveText("¥ 22.00");
	await page.locator("#call-filter").fill("shipping.quote");
	const rows = page.locator(".network-table tbody tr");
	const node = rows.filter({ hasText: "Node ·" });
	await expect(node).toHaveCount(1);
	await node.locator(".outcome").click();
	const selectedKey = await node
		.locator("[data-call]")
		.getAttribute("data-call");
	assert(selectedKey, "Selected Node call must expose its record key");
	const selectedId = selectedKey.slice("Node:".length);
	const peerId = (await page.locator("#peer-name").innerText()).split(" · ")[0];
	await page.route("**/api/lab", async (route) => {
		const response = await route.fetch();
		const snapshot = (await response.json()) as LabServerSnapshot;
		const call = snapshot.recording.calls.find(
			(record) => record.id === selectedId,
		);
		const opened = snapshot.recording.entries.find(
			(entry) =>
				entry.handshake?.type === "peer-opened" &&
				entry.handshake.peerId === peerId,
		);
		assert(
			call && opened,
			"Real snapshot must contain the selected call and current Peer",
		);
		const replacement: LabServerSnapshot = {
			...snapshot,
			instanceId: `foreign-${snapshot.instanceId}`,
			recording: {
				calls: [
					{
						...call,
						peerId,
						traceId: "foreign-server-trace",
						arguments: '["foreign-server-record"]',
					},
				],
				entries: [opened],
			},
		};
		await route.fulfill({ response, json: replacement });
	});
	await expect(node).toHaveCount(0);
	const browser = rows.filter({ hasText: "Browser ·" });
	await expect(browser).toHaveCount(1);
	await expect(browser.locator(".call-link")).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	const inspector = page.locator(".network-grid .inspector");
	await expect(inspector.locator(".payload").first()).toContainText("上海");
	await expect(inspector).not.toContainText("foreign-server-record");
	await page.locator("#call-filter").fill("handshake");
	await page.locator("#side-filter").selectOption("Node");
	await expect(rows).toHaveCount(0);
	await expect(inspector).not.toContainText("foreign-server-record");
});

test("EXAMPLE-LAB-NETWORK-001 a rejected resume cannot establish the first server association", async ({
	page,
}) => {
	await page.getByRole("button", { name: "执行 quote →", exact: true }).click();
	await expect(page.locator("#quote-result")).toHaveText("¥ 22.00");
	await page.route("**/api/lab", async (route) => {
		const response = await route.fetch();
		const snapshot = (await response.json()) as LabServerSnapshot;
		const accepted = snapshot.recording.entries.find(
			(entry) => entry.handshakeFrame?.type === LabHandshakeKindEnum.accept,
		);
		const frame = accepted?.handshakeFrame;
		const opened = snapshot.recording.entries.find(
			(entry) => entry.handshake?.type === "peer-opened",
		);
		const call = snapshot.recording.calls.find(
			(record) => record.method === "quote",
		);
		assert(
			accepted && frame && opened?.handshake && call,
			"Real snapshot must provide handshake and call templates",
		);
		const payload = JSON.parse(frame.payload) as Record<string, unknown>;
		const replacement: LabServerSnapshot = {
			...snapshot,
			instanceId: `unproven-${snapshot.instanceId}`,
			recording: {
				calls: [
					{
						...call,
						peerId: opened.handshake.peerId,
						traceId: "unproven-server-trace",
						arguments: '["foreign-server-record"]',
					},
				],
				entries: [
					opened,
					...[
						{
							kind: LabHandshakeKindEnum.resume,
							direction: LabTransportDirectionEnum.received,
							payload: {
								kind: "resume",
								profile: payload.profile,
								sessionId: frame.sessionId,
								resumeToken: payload.resumeToken,
								receivedThrough: 0,
								resumeAttempt: 1,
							},
						},
						{
							kind: LabHandshakeKindEnum.reject,
							direction: LabTransportDirectionEnum.sent,
							payload: { kind: "reject", code: "resume-rejected" },
						},
					].map((record) => {
						const raw = JSON.stringify(record.payload);
						return {
							...accepted,
							id: `unproven-${record.kind}`,
							handshakeFrame: {
								...frame,
								type: record.kind,
								direction: record.direction,
								payload: raw,
								bytes: Buffer.byteLength(raw),
							},
						};
					}),
				],
			},
		};
		await route.fulfill({ response, json: replacement });
	});
	await page.reload();
	await expect(page.locator("#transport")).toHaveText("Live transport");
	await expect(page.locator("#callback")).toHaveText(
		"Node called this browser.",
	);
	await page.locator("#side-filter").selectOption("Node");
	await page.locator("#call-filter").fill("handshake");
	await expect(page.locator('[data-handshake="resume"]')).toHaveCount(1);
	await expect(page.locator('[data-handshake="reject"]')).toHaveCount(1);
	await expect(page.locator('[data-handshake="peer-opened"]')).toHaveCount(0);
	await expect(page.locator(".network-table tbody tr")).toHaveCount(2);
	await page.locator("#call-filter").fill("shipping.quote");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(0);
	await expect(page.locator(".network-grid .inspector")).not.toContainText(
		"foreign-server-record",
	);
});

test("EXAMPLE-LAB-DEVTOOLS-001 whole rows select JSON details and identify endpoint owners across call directions", async ({
	page,
}) => {
	await page.emulateMedia({ colorScheme: "light" });
	await page.getByRole("button", { name: "执行 quote →", exact: true }).click();
	await expect(page.locator("#quote-result")).toContainText("22");
	await page.locator("#call-filter").fill("shipping.quote");
	const browser = page
		.locator(".network-table tbody tr")
		.filter({ hasText: "Browser ·" });
	const node = page
		.locator(".network-table tbody tr")
		.filter({ hasText: "Node ·" });
	await expect(browser).toHaveCount(1);
	await expect(node).toHaveCount(1);
	const connector = browser.locator('[data-owner="connector"]');
	const acceptor = node.locator('[data-owner="acceptor"]');
	await expect(connector).toHaveText("Connector");
	await expect(acceptor).toHaveText("Acceptor");
	await expect(connector.locator("svg")).toBeVisible();
	await expect(acceptor.locator("svg")).toBeVisible();
	const colors: string[][] = [];
	for (const theme of ["light", "dark"]) {
		if (theme === "dark")
			await page
				.getByRole("button", { name: "切换深浅主题", exact: true })
				.click();
		const current = await Promise.all(
			[connector, acceptor].map((badge) =>
				badge.evaluate((element) => getComputedStyle(element).color),
			),
		);
		expect(current[0]).not.toBe(current[1]);
		colors.push(current);
	}
	expect(colors[0]?.[0]).not.toBe(colors[1]?.[0]);
	expect(colors[0]?.[1]).not.toBe(colors[1]?.[1]);

	for (const [row, target] of [
		[node, node.locator(".outcome")],
		[browser, browser.locator("td").nth(2)],
		[node, node.locator(".waterfall-bar")],
		[browser, connector.locator("svg")],
		[node, node.locator("td").first()],
	] as const) {
		await page.getByRole("tab", { name: "Overview", exact: true }).click();
		await target.click({ position: { x: 2, y: 2 } });
		await expect(row).toHaveClass("selected");
		await expect(row.locator(".call-link")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(
			page.locator('.network-table [aria-pressed="true"]'),
		).toHaveCount(1);
		await expect(
			page.getByRole("tab", { name: "Payload", exact: true }),
		).toHaveAttribute("aria-selected", "true");
		await expect(page.locator(".inspector .payload").first()).toContainText(
			"上海",
		);
	}
	for (const [row, key] of [
		[browser, "Enter"],
		[node, "Space"],
	] as const) {
		await page.getByRole("tab", { name: "Overview", exact: true }).click();
		await row
			.getByRole("button", { name: "shipping.quote", exact: true })
			.press(key);
		await expect(row).toHaveClass("selected");
		await expect(row.locator(".call-link")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(
			page.getByRole("tab", { name: "Payload", exact: true }),
		).toHaveAttribute("aria-selected", "true");
	}

	await page.locator('[data-scenario="peers"]').click();
	await page.locator("#peer-message").fill("owner roles survive reverse calls");
	await page.getByRole("button", { name: "定向回调", exact: true }).click();
	await expect(page.locator("#callback")).toHaveText(
		"owner roles survive reverse calls",
	);
	await page.locator("#call-filter").fill("lab-browser.receive");
	await expect(connector).toHaveText("Connector");
	await expect(acceptor).toHaveText("Acceptor");
	await expect(page.locator(".network-table")).not.toContainText(
		/outgoing|incoming/,
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
		.filter({ hasText: "Browser ·" });
	await expect(caller).toHaveCount(1);
	await expect(caller).toContainText("fulfilled");
	await caller
		.getByRole("button", { name: "shipping.quote", exact: true })
		.click();
	await expect(
		page.getByRole("tab", { name: "Payload", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(page.locator(".inspector .payload").first()).toContainText(
		"上海",
	);
	await expect(page.locator(".inspector .payload").last()).toContainText(
		'"amount": 22',
	);
	const argumentsJson = await page
		.locator(".inspector .payload")
		.first()
		.innerText();
	expect(argumentsJson).toBe(
		JSON.stringify(JSON.parse(argumentsJson), null, 2),
	);
	await expect(page.locator(".network-table")).not.toContainText(
		/outgoing|incoming/,
	);
	await page.getByRole("tab", { name: "Overview", exact: true }).click();
	await caller
		.getByRole("button", { name: "shipping.quote", exact: true })
		.click();
	await expect(
		page.getByRole("tab", { name: "Payload", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await page.getByRole("tab", { name: "Flow", exact: true }).click();
	const browser = page.locator(".flow-endpoint").filter({
		has: page.getByRole("heading", { name: "Browser / APP", exact: true }),
	});
	const node = page.locator(".flow-endpoint").filter({
		has: page.getByRole("heading", { name: "Node / APP", exact: true }),
	});
	await expect(browser).toContainText("quote · fulfilled");
	await expect(node).toContainText("quote · fulfilled");
	await expect(page.locator(".flow-panel")).not.toContainText(
		/outgoing|incoming/,
	);
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
	await page.getByRole("button", { name: "清空全部记录", exact: true }).click();
	await expect(page.locator("#clear-records")).toBeEnabled();
	await page.getByRole("tab", { name: "Network", exact: true }).click();
	await page.locator("#call-filter").fill("report");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(2);
	await expect(page.locator(".network-table .outcome")).toHaveText([
		"pending",
		"pending",
	]);
	await page.getByRole("tab", { name: "Sources", exact: true }).click();
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
	await page.getByRole("tab", { name: "Network", exact: true }).click();
	await page.locator("#call-filter").fill("report");
	const caller = page
		.locator(".network-table tr")
		.filter({ hasText: "Browser ·" });
	await expect(caller).toContainText("canceled");
	const handler = page
		.locator(".network-table tr")
		.filter({ hasText: "Node ·" });
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
	// Keep the real WebSocket call live while its handler state remains unobserved.
	const blockedPoll = page.waitForEvent("requestfailed", {
		predicate: (request) => new URL(request.url()).pathname === "/api/lab",
	});
	await page.route("**/api/lab", (route) => route.abort());
	await blockedPoll;
	await page.locator("#report-pause").click();
	await page.locator("#report-cancel").click();
	await expect(page.locator("#report-result")).toContainText("canceled");
	await expect(page.locator(".pause-banner")).not.toContainText("Paused");
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
	await page.getByRole("tab", { name: "Network", exact: true }).click();
	await page.locator("#call-filter").fill("echo");
	await page
		.locator(".network-table tr")
		.filter({ hasText: "TypeError" })
		.getByRole("button", { name: "lab.echo", exact: true })
		.click();
	await page.getByRole("tab", { name: "Payload", exact: true }).click();
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
	const wire = captureHandshakeFrames(page);
	await page.locator("#side-filter").selectOption("Browser");
	await page.locator("#call-filter").fill("accept");
	const accept = await readHandshakePayload(
		page,
		page.locator(
			'.network-table [data-handshake="accept"][data-direction="received"]',
		),
	);
	await page.locator("#side-filter").selectOption("all");
	await page.locator("#call-filter").clear();
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
	await page.locator("#call-filter").fill(peer.split(" · ")[0]);
	for (const type of ["peer-recovering", "peer-recovered"]) {
		for (const side of ["Browser", "Node"]) {
			await expect(
				page
					.locator(`.network-table [data-handshake="${type}"]`)
					.filter({ hasText: `${side} ·` }),
			).toHaveCount(1);
		}
	}
	await page.locator("#status-filter").selectOption("pending");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(2);
	await expect(
		page.locator('.network-table [data-handshake="peer-recovering"]'),
	).toHaveCount(2);
	await page.locator("#status-filter").selectOption("fulfilled");
	await expect(
		page.locator('.network-table [data-handshake="peer-recovering"]'),
	).toHaveCount(0);
	await expect(
		page.locator('.network-table [data-handshake="peer-recovered"]'),
	).toHaveCount(2);
	await page.locator("#side-filter").selectOption("Browser");
	await page.locator("#call-filter").fill("resume");
	const resumeRow = page.locator(
		'.network-table [data-handshake="resume"][data-direction="sent"]',
	);
	const resume = await readHandshakePayload(page, resumeRow);
	expect(resume).toEqual(wire.sent.find((frame) => frame.kind === "resume"));
	expect(resume.sessionId).toBe(accept.sessionId);
	expect(resume.resumeToken).toBe(accept.resumeToken);
	expect(resume.profile).toBe(accept.profile);
	expect(resume.resumeAttempt).toBe(1);
	expect(Number.isSafeInteger(resume.receivedThrough)).toBe(true);
	expect(resume.receivedThrough).toBeGreaterThanOrEqual(0);
	await expect(resumeRow.locator(".outcome")).toHaveText("fulfilled");
	await page.locator("#call-filter").fill("accept");
	const resumedAccept = await readHandshakePayload(
		page,
		page
			.locator(
				'.network-table [data-handshake="accept"][data-direction="received"]',
			)
			.first(),
	);
	expect(resumedAccept).toEqual(
		wire.received.find((frame) => frame.kind === "accept"),
	);
	expect(resumedAccept.sessionId).toBe(accept.sessionId);
	expect(resumedAccept.bindingEpoch).toBe(Number(accept.bindingEpoch) + 1);
	expect(Number.isSafeInteger(resumedAccept.receivedThrough)).toBe(true);
	expect(resumedAccept.receivedThrough).toBeGreaterThanOrEqual(0);
	expect(resumedAccept).not.toHaveProperty("resumeToken");
	await page.locator("#call-filter").fill("handshake");
	await page.locator("#side-filter").selectOption("all");
	for (const direction of ["sent", "received"]) {
		for (const kind of ["fresh", "resume"])
			await expect(
				page.locator(
					`[data-handshake="${kind}"][data-direction="${direction}"]`,
				),
			).toHaveCount(1);
		const accepts = page.locator(
			`[data-handshake="accept"][data-direction="${direction}"]`,
		);
		await expect(accepts).toHaveCount(2);
		const epochs: unknown[] = [];
		const connections: string[] = [];
		for (const row of await accepts.all()) {
			const frame = await readHandshakePayload(page, row);
			expect(frame.sessionId).toBe(accept.sessionId);
			epochs.push(frame.bindingEpoch);
			connections.push(await row.locator(".request-meta").innerText());
		}
		expect(epochs.sort()).toEqual([1, 2]);
		expect(new Set(connections).size).toBe(2);
	}
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
	await page.locator("#call-filter").fill("recovery-expired");
	await page.locator("#side-filter").selectOption("Browser");
	await page.locator("#status-filter").selectOption("failed");
	const closed = page.locator('.network-table [data-handshake="peer-closed"]');
	await expect(closed).toHaveCount(1);
	await closed.locator(".outcome").click();
	await expect(
		page.locator(".network-grid .inspector .property").filter({
			has: page.getByText("Close reason", { exact: true }),
		}),
	).toContainText("recovery-expired");
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

test("EXAMPLE-LAB-DEVTOOLS-001 dock and pane sizes survive scrolling, polling, and tab switches", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	const dock = page.locator(".dock");
	const dockHandle = page.getByRole("separator", {
		name: "调整 DevTools 高度",
	});
	await dragSeparator(page, dockHandle, 0, -70);
	await expect
		.poll(async () => {
			const bounds = await dock.boundingBox();
			assert(bounds, "DevTools dock must be visible");
			return bounds.y + bounds.height;
		})
		.toBeCloseTo(900, 0);
	await page.locator(".greeting-details summary").click();
	await page.locator(".workspace").evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect
		.poll(() =>
			page.locator(".workspace").evaluate((element) => element.scrollTop),
		)
		.toBeGreaterThan(0);
	const afterScroll = await dock.boundingBox();
	assert(afterScroll, "DevTools dock must remain visible after scrolling");
	expect(afterScroll.y + afterScroll.height).toBeCloseTo(900, 0);

	const consoleHandle = page.getByRole("separator", {
		name: "调整 Console 高度",
	});
	await dragSeparator(page, consoleHandle, 0, -25);
	const dockSize = await getSeparatorValue(dockHandle);
	const consoleSize = await getSeparatorValue(consoleHandle);
	const sizes = new Map<string, string>();
	for (const panel of ["Network", "Sources", "Flow"]) {
		await page.getByRole("tab", { name: panel, exact: true }).click();
		const handle = page.getByRole("separator", {
			name: `调整 ${panel} 面板大小`,
		});
		await expect(handle).toHaveAttribute("aria-orientation", "vertical");
		await dragSeparator(page, handle, -65, 0);
		const beforeKey = await getSeparatorValue(handle);
		await handle.press("ArrowRight");
		await expect(handle).not.toHaveAttribute("aria-valuenow", beforeKey);
		sizes.set(panel, await getSeparatorValue(handle));
	}
	await page.locator('[data-scenario="values"]').click();
	await page.waitForResponse(
		(response) => new URL(response.url()).pathname === "/api/lab",
	);
	for (const [panel, value] of sizes) {
		await page.getByRole("tab", { name: panel, exact: true }).click();
		await expect(
			page.getByRole("separator", { name: `调整 ${panel} 面板大小` }),
		).toHaveAttribute("aria-valuenow", value);
	}
	await expect(dockHandle).toHaveAttribute("aria-valuenow", dockSize);
	await expect(consoleHandle).toHaveAttribute("aria-valuenow", consoleSize);
});

test("EXAMPLE-LAB-DEVTOOLS-001 narrow panes resize vertically and clamp keyboard extremes to the viewport", async ({
	page,
}) => {
	await page.setViewportSize({ width: 360, height: 700 });
	for (const panel of ["Network", "Sources", "Flow"]) {
		await page.getByRole("tab", { name: panel, exact: true }).click();
		const handle = page.getByRole("separator", {
			name: `调整 ${panel} 面板大小`,
		});
		await expect(handle).toHaveAttribute("aria-orientation", "horizontal");
		const before = await getSeparatorValue(handle);
		await handle.press("ArrowDown");
		await expect(handle).not.toHaveAttribute("aria-valuenow", before);
		for (const key of ["Home", "End"]) {
			await handle.press(key);
			const value = Number(await getSeparatorValue(handle));
			expect(value).toBeGreaterThan(0);
			expect(value).toBeLessThan(100);
		}
	}
	const dockHandle = page.getByRole("separator", {
		name: "调整 DevTools 高度",
	});
	for (const key of ["Home", "End"]) {
		await dockHandle.press(key);
		const bounds = await page.locator(".dock").boundingBox();
		assert(bounds, "DevTools dock must remain visible at resize limits");
		expect(bounds.y).toBeGreaterThan(0);
		expect(bounds.y + bounds.height).toBeCloseTo(700, 0);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth),
		).toBeLessThanOrEqual(360);
	}
	await page.setViewportSize({ width: 1024, height: 700 });
	await expect(
		page.getByRole("separator", { name: "调整 Flow 面板大小" }),
	).toHaveAttribute("aria-orientation", "vertical");
	const bounds = await page.locator(".dock").boundingBox();
	assert(bounds, "DevTools dock must remain visible after viewport changes");
	expect(bounds.y + bounds.height).toBeCloseTo(700, 0);
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
			await expect(
				page.locator(".network-table .endpoint-badge").first(),
			).toBeInViewport({ ratio: 1 });
			await expect(
				page.locator(".inspector .payload").first(),
			).toBeInViewport();
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
				await page.getByRole("tab", { name: panel, exact: true }).click();
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth),
					panel,
				).toBeLessThanOrEqual(width);
			}
			await page.getByRole("tab", { name: "Network", exact: true }).click();
			await expect(
				page.getByRole("tab", { name: "Network", exact: true }),
			).toHaveAttribute("aria-selected", "true");
			await expect(
				page.locator(".inspector .payload").first(),
			).toBeInViewport();
			await page.screenshot({
				path: testInfo.outputPath(`workbench-${width}-${colorScheme}.png`),
				fullPage: true,
			});
		});
	}
}

async function expectNetworkSession(
	page: Page,
	sessionId: unknown,
): Promise<void> {
	await page.locator("#call-filter").fill("handshake");
	await page.locator("#side-filter").selectOption("Node");
	await expect(page.locator(".network-table tbody tr")).toHaveCount(3);
	for (const kind of ["peer-opened", "fresh", "accept"])
		await expect(page.locator(`[data-handshake="${kind}"]`)).toHaveCount(1);
	const accept = await readHandshakePayload(
		page,
		page.locator('[data-handshake="accept"][data-direction="sent"]'),
	);
	expect(accept.sessionId).toBe(sessionId);
}

function captureHandshakeFrames(page: Page) {
	const frames = {
		sent: [] as Record<string, unknown>[],
		received: [] as Record<string, unknown>[],
	};
	const record = (
		target: Record<string, unknown>[],
		payload: string | Buffer,
	) => {
		const frame = JSON.parse(payload.toString()) as Record<string, unknown>;
		if (["fresh", "accept", "resume", "reject"].includes(String(frame.kind)))
			target.push(frame);
	};
	page.on("websocket", (socket) => {
		if (new URL(socket.url()).pathname !== "/rpc") return;
		socket.on("framesent", ({ payload }) => record(frames.sent, payload));
		socket.on("framereceived", ({ payload }) =>
			record(frames.received, payload),
		);
	});
	return frames;
}

async function readHandshakePayload(
	page: Page,
	row: Locator,
): Promise<Record<string, unknown>> {
	await row.locator(".outcome").click();
	await expect(row).toHaveClass("selected");
	await expect(
		page.getByRole("tab", { name: "Payload", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	return JSON.parse(
		await page.locator(".network-grid .inspector .payload").innerText(),
	);
}

async function dragSeparator(
	page: Page,
	handle: Locator,
	x: number,
	y: number,
) {
	const before = await getSeparatorValue(handle);
	const bounds = await handle.boundingBox();
	assert(bounds, "Resizable separator must be visible");
	const start = {
		x: bounds.x + bounds.width / 2,
		y: bounds.y + bounds.height / 2,
	};
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + x, start.y + y, { steps: 5 });
	await page.mouse.up();
	await expect(handle).not.toHaveAttribute("aria-valuenow", before);
}

async function getSeparatorValue(handle: Locator): Promise<string> {
	const value = await handle.getAttribute("aria-valuenow");
	assert(value !== null, "Resizable separator must expose its current value");
	return value;
}
