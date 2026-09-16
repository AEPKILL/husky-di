/**
 * @overview Adapts Remote exposure, values, errors, cancellation, streams, recovery and termination specifications to real peers.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type { ILabCase, ILabNode } from "@husky-di/example-remote-lab/sdk";

export const labCase: ILabCase = {
	title: "Remote · real Chromium / Node business behavior",
	timeoutMs: 30000,
	async run(ctx) {
		ctx.log("Adapted specification sources", [
			"packages/remote/tests/specification/exposure.test.ts",
			"packages/remote/tests/specification/application-value.test.ts",
			"packages/remote/tests/specification/outgoing-invocation.test.ts",
			"packages/remote/tests/specification/stream.test.ts",
			"packages/remote/tests/specification/recovery.test.ts",
			"packages/remote/tests/specification/connector-termination.test.ts",
			"examples/remote-lab/tests/lab/lab-scenarios.test.ts#EXAMPLE-LAB-RPC-001,VALUE-001,EXPOSURE-001,PEERS-001,RESOURCE-001,DEBUG-001",
		]);
		let server: ILabNode;
		let browser: ILabNode;
		let node: ILabNode;
		await ctx.step("Create isolated real Chromium and Node peers", async () => {
			server = await ctx.environment.node("services/server.ts");
			const endpoint = (server.result as { endpoint: string }).endpoint;
			browser = await ctx.environment.browser("services/browser-client.ts", {
				endpoint,
				label: "Chromium",
			});
			node = await ctx.environment.node("services/node-client.ts", {
				endpoint,
				label: "Node",
			});
			ctx.assert(
				(browser.result as { runtime: string }).runtime === "browser",
				"Browser module ran inside Chromium",
			);
			ctx.assert(
				(node.result as { runtime: string }).runtime === "node",
				"Node module ran in a Node subprocess",
			);
		});
		await ctx.step(
			"EXAMPLE-LAB-RPC-001 · shipping business contract and validation",
			async () => {
				const quote = await browser.call<{
					from: string;
					to: string;
					kg: number;
					amount: number;
					currency: string;
				}>("quote", " Shanghai ", "Beijing", 2);
				ctx.assert(
					quote.from === "Shanghai" &&
						quote.to === "Beijing" &&
						quote.kg === 2 &&
						quote.amount === 20 &&
						quote.currency === "CNY",
					"A real 2 kg shipping quote costs 20 CNY and trims locations",
					quote,
				);
				ctx.assert(
					(await node.call<{ amount: number }>("quote", "A", "B", 2.126))
						.amount === 20.5,
					"Illustrative price rounds to cents",
				);
				for (const args of [
					[" ", "B", 1],
					["A".repeat(81), "B", 1],
					["A", "", 1],
					["A", "B", 0],
					["A", "B", 101],
				]) {
					ctx.assert(
						await rejectsCode(
							() => browser.call("quote", ...args),
							"handler-failed",
						),
						"Invalid shipping business input is rejected by the actual handler",
						args,
					);
				}
			},
		);
		await ctx.step(
			"EXAMPLE-LAB-VALUE-001 · preflight and unknown-method boundaries",
			async () => {
				const before = await server.call<{ echoEntries: number }>("metrics");
				const rejected = await browser.call<{
					outcomes: string[];
					getters: number;
				}>("invalidValues");
				const after = await server.call<{ echoEntries: number }>("metrics");
				ctx.assert(
					rejected.outcomes.length === 6 &&
						rejected.outcomes.every((outcome) => outcome === "TypeError"),
					"All six invalid application values fail local Remote preflight",
					rejected,
				);
				ctx.assert(
					rejected.getters === 0 && after.echoEntries === before.echoEntries,
					"Rejected values invoke neither getters nor remote handlers",
					{ rejected, before, after },
				);
				ctx.assert(
					(await browser.call("unknownMethod")) === "unknown-method",
					"A descriptor naming a missing method produces actual unknown-method",
				);
				ctx.assert(
					(await browser.call("echo", "still-usable")) === "still-usable",
					"Valid RPC remains usable after preflight and dispatch errors",
				);
			},
		);
		await ctx.step(
			"EXAMPLE-LAB-EXPOSURE-001 · global and per-Peer cleanup",
			async () => {
				const browserId = await browser.call("inspect");
				const nodeId = await node.call("inspect");
				ctx.assert(
					typeof browserId === "string" &&
						typeof nodeId === "string" &&
						browserId !== nodeId,
					"Distinct Peer-local inspection exposures retain stable IDs",
					{ browserId, nodeId },
				);
				ctx.assert(
					(await server.call("exposureConflict")) === "TypeError",
					"Remote rejects a real Acceptor/Peer wire-name conflict",
				);
				await server.call("setPeerExposure", 0, false);
				ctx.assert(
					await rejectsCode(() => browser.call("inspect"), "unknown-service"),
					"Revoking one Peer exposure makes only its facade unavailable",
				);
				ctx.assert(
					(await node.call("inspect")) === nodeId,
					"Sibling Peer exposure survives targeted revoke",
				);
				await server.call("setPeerExposure", 0, true);
				ctx.assert(
					(await browser.call("inspect")) === browserId,
					"Per-Peer re-exposure restores the retained facade",
				);
				await server.call("setShippingExposure", false);
				for (const peer of [browser, node])
					ctx.assert(
						await rejectsCode(
							() => peer.call("quote", "A", "B", 2),
							"unknown-service",
						),
						"Acceptor revoke removes shipping from every Peer",
					);
				ctx.assert(
					(await browser.call("echo", "control-alive")) === "control-alive",
					"Control service remains callable during shipping revoke",
				);
				await server.call("setShippingExposure", true);
				ctx.assert(
					(await browser.call<{ amount: number }>("quote", "A", "B", 2))
						.amount === 20,
					"Global re-exposure restores the retained shipping facade",
				);
			},
		);
		await ctx.step(
			"EXAMPLE-LAB-PEERS-001 · independent fanout outcomes",
			async () => {
				await node.call("setCallbackFailure", true);
				const results = await server.call<
					{ peerId: string; outcome: string; result: string }[]
				>("fanout", "fanout");
				ctx.assert(
					results.length === 2 &&
						new Set(results.map((result) => result.peerId)).size === 2,
					"Fanout reports every currently connected stable Peer",
					results,
				);
				ctx.assert(
					results.some(
						(result) =>
							result.outcome === "fulfilled" &&
							result.result === "Chromium: fanout",
					) &&
						results.some(
							(result) =>
								result.outcome === "rejected" &&
								result.result === "handler-failed",
						),
					"One callback failure preserves the sibling success",
					results,
				);
				await node.call("setCallbackFailure", false);
			},
		);
		await ctx.step(
			"EXAMPLE-LAB-RESOURCE-001 · actual local pending admission",
			async () => {
				const result = await browser.call<{
					outcomes: { outcome: string; code: string | null }[];
					recovered: string;
				}>("capacity");
				ctx.assert(
					result.outcomes.filter((item) => item.outcome === "fulfilled")
						.length === 8 &&
						result.outcomes.filter((item) => item.code === "unavailable")
							.length === 4,
					"Twelve simultaneous calls exhaust Remote's configured eight pending slots",
					result,
				);
				ctx.assert(
					result.recovered === "capacity-released",
					"Completion releases admission for the same Peer",
				);
			},
		);
		await ctx.step(
			"Bidirectional dispatch and multi-Peer isolation",
			async () => {
				for (const [index, label] of [
					[0, "Chromium"],
					[1, "Node"],
				] as const) {
					const value = await browser.call("callback", index, "hello");
					ctx.assert(
						value === `${label}: hello`,
						"Directed callback reaches the chosen Peer",
						value,
						`${label}: hello`,
					);
				}
			},
		);
		await ctx.step("Structured values and safe handler errors", async () => {
			const value = {
				text: "saved project",
				nested: [1, true, null, { value: 3 }],
			};
			ctx.assert(
				JSON.stringify(await browser.call("echo", value)) ===
					JSON.stringify(value),
				"Legal application value survives RPC",
				value,
			);
			ctx.assert(
				(await node.call("failure")) === "handler-failed",
				"Handler failure preserves the safe error code",
			);
		});
		await ctx.step(
			"Service exposure changes affect existing facades",
			async () => {
				await server.call("setExposure", false);
				let unavailable = false;
				try {
					await node.call("echo", "hidden");
				} catch (error) {
					unavailable = String(error).includes("unknown-service");
				}
				ctx.assert(unavailable, "Disposed exposure cannot be called");
				await server.call("setExposure", true);
				ctx.assert(
					(await node.call("echo", "restored")) === "restored",
					"Restored exposure is callable",
				);
			},
		);
		await ctx.step("Caller cancellation and Observable lifecycle", async () => {
			ctx.assert(
				(await browser.call("cancel")) === "canceled",
				"Cancellation settles caller as canceled",
			);
			const values = await node.call("stream", 3);
			ctx.assert(
				JSON.stringify(values) === "[0,1,2]",
				"Remote stream preserves emission order",
				values,
				[0, 1, 2],
			);
			await browser.call("cancelStream");
			await delay(50);
			const metrics = await server.call<{
				canceled: number;
				streamTeardowns: number;
			}>("metrics");
			ctx.assert(
				metrics.canceled === 1,
				"Cancelable handler receives its AbortSignal",
				metrics.canceled,
				1,
			);
			ctx.assert(
				metrics.streamTeardowns === 2,
				"Complete and unsubscribe both tear down actual sources",
				metrics.streamTeardowns,
				2,
			);
		});
		await ctx.step(
			"EXAMPLE-LAB-DEBUG-001 · canceled caller survives late handler settlement",
			async () => {
				await browser.call("startHeld", "cancel-survives");
				await eventually(
					async () =>
						(
							await server.call<{ pending: boolean }>(
								"heldStatus",
								"cancel-survives",
							)
						).pending,
				);
				ctx.assert(
					(await browser.call<{ outcome: string }>("cancelHeld")).outcome ===
						"canceled",
					"Caller settles canceled while the handler remains paused",
				);
				await eventually(
					async () =>
						(
							await server.call<{ aborted: boolean }>(
								"heldStatus",
								"cancel-survives",
							)
						).aborted,
				);
				ctx.assert(
					(
						await server.call<{ pending: boolean }>(
							"heldStatus",
							"cancel-survives",
						)
					).pending,
					"Application-owned pause survives handler AbortSignal",
				);
				ctx.assert(
					(await server.call("resumeHeld", "cancel-survives")) === true,
					"Paused computation can resume after caller cancellation",
				);
				await eventually(async () =>
					Boolean(
						(
							await server.call<{ result: unknown }>(
								"heldStatus",
								"cancel-survives",
							)
						).result,
					),
				);
				const handler = await server.call<{ result: { aborted: boolean } }>(
					"heldStatus",
					"cancel-survives",
				);
				const caller = await browser.call<{
					outcome: string;
					terminals: string[];
				}>("heldOutcome");
				ctx.assert(
					handler.result.aborted &&
						caller.outcome === "canceled" &&
						JSON.stringify(caller.terminals) === '["canceled"]',
					"Late handler fulfillment observes cancellation without a second caller terminal",
					{ handler, caller },
				);
				ctx.assert(
					(await server.call("resumeHeld", "cancel-survives")) === false,
					"Settled pause cannot be resumed twice",
				);
			},
		);
		await ctx.step(
			"RPC-STREAM-002 · static sources share only within each Peer",
			async () => {
				await browser.call("openStatic", 2);
				await node.call("openStatic", 1);
				await eventually(
					async () =>
						(await server.call<{ staticSubscriptions: number }>("metrics"))
							.staticSubscriptions === 2,
				);
				await server.call("emitStatic", 7);
				await eventually(async () =>
					(await browser.call<{ values: number[] }[]>("staticSnapshot")).every(
						(record) => record.values.length === 1,
					),
				);
				const browserValues =
					await browser.call<{ values: number[]; notifications: string[] }[]>(
						"staticSnapshot",
					);
				await eventually(
					async () =>
						(await node.call<{ values: number[] }[]>("staticSnapshot"))[0]
							.values.length === 1,
				);
				ctx.assert(
					JSON.stringify(browserValues.map((record) => record.values)) ===
						"[[7],[7]]",
					"Two static subscribers on one Peer receive one shared source emission",
					browserValues,
				);
				await browser.call("closeStatic", 0);
				await delay(20);
				ctx.assert(
					(await server.call<{ staticTeardowns: number }>("metrics"))
						.staticTeardowns === 0,
					"First unsubscribe leaves the shared source alive",
				);
				await browser.call("closeStatic", 1);
				await node.call("closeStatic", 0);
				await eventually(
					async () =>
						(await server.call<{ staticTeardowns: number }>("metrics"))
							.staticTeardowns === 2,
				);
				ctx.assert(
					(
						await browser.call<{ notifications: string[] }[]>("staticSnapshot")
					).every((record) => record.notifications.length === 0),
					"Actual Remote unsubscribe remains silent and final subscribers release both source connections",
				);
			},
		);
		await ctx.step(
			"EXAMPLE-LAB-STREAM-001 · explicit Lab-only replay and overflow instrumentation",
			async () => {
				ctx.log("Legacy instrumentation provenance", {
					source:
						"examples/remote-lab/src/utils/create-lab-stream-experiment.util.ts",
					remoteWireExecution: false,
				});
				const experiment = await ctx.environment.browser(
					"services/stream-instrumentation.ts",
				);
				await experiment.call("open", "method");
				await experiment.call("open", "method");
				const firstStatic = await experiment.call<number>("open", "static");
				const secondStatic = await experiment.call<number>("open", "static");
				const opened = await experiment.call<{
					methodConnections: number;
					staticConnections: number;
				}>("snapshot");
				ctx.assert(
					opened.methodConnections === 2 && opened.staticConnections === 1,
					"Lab instrumentation keeps independent method executions and one shared static source",
					opened,
				);
				await experiment.call("next", "live");
				await experiment.call("unsubscribe", secondStatic);
				ctx.assert(
					(await experiment.call<{ staticTeardowns: number }>("snapshot"))
						.staticTeardowns === 0,
					"Lab static source survives the first unsubscribe",
				);
				await experiment.call("unsubscribe", firstStatic);
				ctx.assert(
					(await experiment.call<{ staticTeardowns: number }>("snapshot"))
						.staticTeardowns === 1,
					"Lab static source tears down after its last subscriber",
				);
				await experiment.call("disconnect");
				await experiment.call("next", "first");
				await experiment.call("next", "second");
				ctx.assert(
					(await experiment.call<{ retained: number }>("snapshot")).retained ===
						4,
					"Lab replay budget retains four real observed subscription events",
				);
				await experiment.call("recover");
				const replay = await experiment.call<{
					retained: number;
					streams: {
						kind: string;
						values: string[];
						notifications: string[];
					}[];
				}>("snapshot");
				ctx.assert(
					replay.retained === 0 &&
						replay.streams
							.filter((stream) => stream.kind === "method")
							.every(
								(stream) =>
									JSON.stringify(stream.values) === '["live","first","second"]',
							),
					"Lab recovery replays buffered observations in order and releases its budget",
					replay,
				);
				ctx.assert(
					replay.streams
						.filter((stream) => stream.kind === "static")
						.every((stream) => stream.notifications.length === 0),
					"Lab unsubscribe creates no synthetic complete/error notification",
				);
				await experiment.call("complete");
				await experiment.call("open", "method");
				await experiment.call("error");
				await experiment.call("open", "method");
				await experiment.call("overflow");
				const ended = await experiment.call<{
					retained: number;
					streams: { terminal: string }[];
				}>("snapshot");
				ctx.assert(
					ended.streams.some((stream) => stream.terminal === "complete") &&
						ended.streams.some(
							(stream) => stream.terminal === "error(handler-failed)",
						) &&
						ended.streams.some(
							(stream) => stream.terminal === "error(unavailable)",
						) &&
						ended.retained === 0,
					"Lab-only terminal and overflow observations stay distinct; they are not claimed as Remote wire frames",
					ended,
				);
				await experiment.call("reset");
				ctx.assert(
					(await experiment.call<{ streams: unknown[] }>("snapshot")).streams
						.length === 0,
					"Reset releases all Lab experiment subscriptions",
				);
			},
		);
		await ctx.step(
			"Recovery retains an admitted handler without redispatch",
			async () => {
				const before = await server.call<{ entries: number }>("metrics");
				await browser.call("startDelayed", 300);
				await delay(40);
				await browser.call("drop");
				const result = await browser.call<{
					entries: number;
					aborted: boolean;
				}>("finishDelayed");
				ctx.assert(
					result.entries === before.entries + 1 && !result.aborted,
					"Recovery finishes the original handler exactly once",
					result,
				);
				ctx.assert(
					(await browser.call("echo", "recovered")) === "recovered",
					"Retained facade remains usable after replacement Connection",
				);
			},
		);
		await ctx.step(
			"Graceful shutdown drains in-flight RPC and caches completion",
			async () => {
				await node.call("startDelayed", 120);
				await delay(30);
				const terminal = await node.call<{
					cached: boolean;
					state: { status: string; reason: string };
				}>("shutdown");
				const result = await node.call<{ aborted: boolean }>("finishDelayed");
				ctx.assert(
					terminal.cached &&
						terminal.state.status === "closed" &&
						terminal.state.reason === "graceful-shutdown",
					"Graceful termination reaches a confirmed terminal state",
					terminal,
				);
				ctx.assert(
					!result.aborted,
					"Graceful shutdown allows the admitted handler to finish",
				);
			},
		);
	},
};

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rejectsCode(operation: () => Promise<unknown>, code: string) {
	try {
		await operation();
		return false;
	} catch (error) {
		return String(error).includes(code);
	}
}
async function eventually(check: () => Promise<boolean>) {
	const deadline = Date.now() + 2500;
	while (!(await check())) {
		if (Date.now() > deadline)
			throw new Error("Built-in behavior did not settle within 2500 ms");
		await delay(10);
	}
}
