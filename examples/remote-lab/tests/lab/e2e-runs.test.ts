/**
 * @overview Verifies shared observable package-scenario runs and test-owned cleanup.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import assert from "node:assert/strict";
import { connect } from "node:net";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { RpcCallDirectionEnum, RpcEventTypeEnum } from "@husky-di/remote";
import { LabE2ePackageEnum } from "@/enums/lab-e2e.enum";
import {
	LabSideEnum,
	LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";
import { createExampleServer } from "@/factories/example-server.factory";
import { createLabE2eRunner } from "@/factories/lab-e2e-runner.factory";
import { createLabRecorder } from "@/factories/lab-recorder.factory";
import type { LabE2eCaseContext, LabE2eSnapshot } from "@/types/lab-e2e.type";

test("EXAMPLE-LAB-E2E-001/003 runs remote and remote-websocket scenarios and retains inspectable data flow", {
	timeout: 30_000,
}, async () => {
	const server = await createExampleServer({ port: 0 });
	try {
		const starts = await Promise.all(
			[0, 1].map(
				async () =>
					(await (
						await fetch(`${server.origin}/api/e2e/start`, { method: "POST" })
					).json()) as LabE2eSnapshot,
			),
		);
		assert.ok(starts[0].active?.id);
		assert.equal(starts[0].active.id, starts[1].active?.id);
		const finished = await waitForSnapshot(
			server.origin,
			(snapshot) => !snapshot.active && Boolean(snapshot.last),
		);
		assert.equal(finished.last?.status, "passed");
		assert.equal(finished.last?.cleanupComplete, true);
		assert.deepEqual(
			new Set(finished.last?.tests.map((item) => item.package)),
			new Set([LabE2ePackageEnum.remote, LabE2ePackageEnum.remoteWebSocket]),
		);
		assert.ok(
			finished.last?.tests.every(
				(item) =>
					item.source.startsWith("packages/") &&
					item.recordings.some((recording) =>
						recording.snapshot.entries.some(
							(entry) => entry.transportMessage !== undefined,
						),
					),
			),
		);
		assert.ok(
			finished.last?.tests.every((item) =>
				item.recordings.every(
					(recording) =>
						recording.runId === finished.last?.id &&
						recording.caseId === item.id &&
						recording.package === item.package &&
						recording.source === item.source,
				),
			),
		);
		assert.ok(
			finished.last?.tests.some((item) =>
				item.recordings.some(
					(recording) => recording.snapshot.calls.length > 0,
				),
			),
		);
		assert.ok(
			finished.last?.tests.some((item) =>
				item.source.endsWith("#connector.source.multicast-terminal-single-use"),
			),
		);
		await fetch(`${server.origin}/api/lab/records`, { method: "DELETE" });
		const retained = (await (
			await fetch(`${server.origin}/api/e2e`)
		).json()) as LabE2eSnapshot;
		assert.deepEqual(retained.last, finished.last);
	} finally {
		await server.shutdown();
	}
});

test("EXAMPLE-LAB-E2E-002 stop interrupts only the active test case and leaves the main Lab alive", async () => {
	const entered = Promise.withResolvers<void>();
	const runner = createLabE2eRunner({
		cases: [
			{
				id: "completed",
				title: "completed observable case",
				package: LabE2ePackageEnum.remote,
				source: "packages/remote/tests/specification/exposure.test.ts",
				async run({ step, capture }) {
					step("completed");
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
				},
			},
			{
				id: "waiting",
				title: "waiting observable case",
				package: LabE2ePackageEnum.remoteWebSocket,
				source: "packages/remote-websocket/tests/specification.test.ts",
				async run({ capture, signal, step }) {
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
					step("waiting for explicit stop");
					entered.resolve();
					await delay(60_000, undefined, { signal });
				},
			},
			{
				id: "not-run",
				title: "later observable case",
				package: LabE2ePackageEnum.remote,
				source: "packages/remote/tests/specification/recovery.test.ts",
				run: async () => undefined,
			},
		],
	});
	const server = await createExampleServer({ port: 0, e2eRunner: runner });
	try {
		await fetch(`${server.origin}/api/e2e/start`, { method: "POST" });
		await entered.promise;
		const stopping = (await (
			await fetch(`${server.origin}/api/e2e/stop`, { method: "POST" })
		).json()) as LabE2eSnapshot;
		assert.equal(stopping.active?.status, "stopping");
		const finished = await waitForSnapshot(
			server.origin,
			(snapshot) => !snapshot.active && Boolean(snapshot.last),
			5_000,
		);
		assert.equal(finished.last?.status, "stopped");
		assert.equal(finished.last?.cleanupComplete, true);
		assert.deepEqual(
			finished.last?.tests.map((item) => item.status),
			["passed", "interrupted", "not-run"],
		);
		assert.equal((await fetch(`${server.origin}/health`)).status, 200);
	} finally {
		await server.shutdown();
	}
});

test("EXAMPLE-LAB-E2E-001/003 continues after an assertion failure but stops on cleanup failure", async () => {
	const outcomes: string[] = [];
	const runner = createLabE2eRunner({
		cases: [
			{
				id: "assertion-failure",
				title: "ordinary assertion failure",
				package: LabE2ePackageEnum.remote,
				source: "packages/remote/tests/specification/exposure.test.ts",
				async run({ capture }) {
					outcomes.push("assertion-failure");
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
					throw new Error("expected assertion evidence");
				},
			},
			{
				id: "continued",
				title: "continued case",
				package: LabE2ePackageEnum.remoteWebSocket,
				source: "packages/remote-websocket/tests/conformance.test.ts",
				async run({ capture }) {
					outcomes.push("continued");
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
				},
			},
			{
				id: "cleanup-failure",
				title: "cleanup failure",
				package: LabE2ePackageEnum.remote,
				source:
					"packages/remote/tests/specification/connector-termination.test.ts",
				async run({ capture, cleanup }) {
					outcomes.push("cleanup-failure");
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
					await cleanup(() => {
						throw new Error("expected cleanup evidence");
					});
				},
			},
			{
				id: "blocked",
				title: "blocked after infrastructure failure",
				package: LabE2ePackageEnum.remote,
				source: "packages/remote/tests/specification/recovery.test.ts",
				async run() {
					outcomes.push("blocked");
				},
			},
		],
	});
	const server = await createExampleServer({ port: 0, e2eRunner: runner });
	try {
		await fetch(`${server.origin}/api/e2e/start`, { method: "POST" });
		const finished = await waitForSnapshot(
			server.origin,
			(snapshot) => !snapshot.active && Boolean(snapshot.last),
		);
		assert.equal(finished.last?.status, "error");
		assert.equal(finished.last?.cleanupComplete, false);
		assert.deepEqual(outcomes, [
			"assertion-failure",
			"continued",
			"cleanup-failure",
		]);
		assert.deepEqual(
			finished.last?.tests.map((item) => item.status),
			["failed", "passed", "failed", "not-run"],
		);
		assert.match(finished.last?.errors.join("\n") ?? "", /cleanup evidence/);
	} finally {
		await server.shutdown();
	}
});

test("EXAMPLE-LAB-E2E-003 stops after an explicitly reported infrastructure failure", async () => {
	const outcomes: string[] = [];
	const runner = createLabE2eRunner({
		cases: [
			{
				id: "missing-association",
				title: "missing endpoint recording",
				package: LabE2ePackageEnum.remote,
				source: "packages/remote/tests/specification/exposure.test.ts",
				async run({ failInfrastructure, own }) {
					outcomes.push("missing-association");
					own(() => {
						throw new Error("cleanup also failed");
					});
					failInfrastructure(
						new Error("connection failed before recording association"),
					);
				},
			},
			{
				id: "blocked",
				title: "blocked after infrastructure failure",
				package: LabE2ePackageEnum.remoteWebSocket,
				source: "packages/remote-websocket/tests/specification.test.ts",
				async run() {
					outcomes.push("blocked");
				},
			},
		],
	});
	const server = await createExampleServer({ port: 0, e2eRunner: runner });
	try {
		await fetch(`${server.origin}/api/e2e/start`, { method: "POST" });
		const finished = await waitForSnapshot(
			server.origin,
			(snapshot) => !snapshot.active && Boolean(snapshot.last),
		);
		assert.deepEqual(outcomes, ["missing-association"]);
		assert.equal(finished.last?.status, "error");
		assert.equal(finished.last?.cleanupComplete, false);
		assert.match(
			finished.last?.errors.join("\n") ?? "",
			/connection failed before recording association/,
		);
		assert.match(finished.last?.errors.join("\n") ?? "", /cleanup also failed/);
	} finally {
		await server.shutdown();
	}
});

test("EXAMPLE-LAB-E2E-002 preserves timeout after settlement during the interruption grace", async () => {
	const runner = createLabE2eRunner({
		caseTimeoutMs: 10,
		cases: [
			{
				id: "slow-settlement",
				title: "slow settlement",
				package: LabE2ePackageEnum.remote,
				source: "packages/remote/tests/specification/recovery.test.ts",
				async run({ capture }) {
					await delay(30);
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
				},
			},
		],
	});
	const server = await createExampleServer({ port: 0, e2eRunner: runner });
	try {
		await fetch(`${server.origin}/api/e2e/start`, { method: "POST" });
		const finished = await waitForSnapshot(
			server.origin,
			(snapshot) => !snapshot.active && Boolean(snapshot.last),
		);
		assert.equal(finished.last?.status, "failed");
		assert.equal(finished.last?.cleanupComplete, true);
		assert.equal(finished.last?.tests[0]?.status, "timed-out");
	} finally {
		await server.shutdown();
	}
});

test("EXAMPLE-LAB-E2E-002 cleans rejected cases and bounds cleanup that never settles", async () => {
	let rejectedCleanupRan = false;
	const runner = createLabE2eRunner({
		cases: [
			{
				id: "rejected-case",
				title: "rejected case",
				package: LabE2ePackageEnum.remote,
				source: "packages/remote/tests/specification/exposure.test.ts",
				async run({ capture, own }) {
					own(() => {
						rejectedCleanupRan = true;
					});
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
					throw new Error("ordinary assertion");
				},
			},
			{
				id: "hanging-cleanup",
				title: "hanging cleanup",
				package: LabE2ePackageEnum.remote,
				source:
					"packages/remote/tests/specification/connector-termination.test.ts",
				async run({ capture, own }) {
					own(() => new Promise<void>(() => undefined));
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
				},
			},
		],
	});
	const server = await createExampleServer({ port: 0, e2eRunner: runner });
	try {
		await fetch(`${server.origin}/api/e2e/start`, { method: "POST" });
		const finished = await waitForSnapshot(
			server.origin,
			(snapshot) => !snapshot.active && Boolean(snapshot.last),
			3_000,
		);
		assert.equal(rejectedCleanupRan, true);
		assert.equal(finished.last?.status, "error");
		assert.equal(finished.last?.cleanupComplete, false);
		assert.match(
			finished.last?.errors.join("\n") ?? "",
			/cleanup did not settle within 1 second/,
		);
	} finally {
		await server.shutdown();
	}
});

test("EXAMPLE-LAB-E2E-002 bounds an unresponsive case, reclaims registered resources, and rejects late updates", async () => {
	const resume = Promise.withResolvers<void>();
	let released = false;
	const runner = createLabE2eRunner({
		caseTimeoutMs: 10,
		cases: [
			{
				id: "unresponsive",
				title: "unresponsive observable case",
				package: LabE2ePackageEnum.remote,
				source: "packages/remote/tests/specification/recovery.test.ts",
				async run({ capture, own, step }) {
					own(() => {
						released = true;
					});
					await captureTestEvidence(capture, LabSideEnum.browser);
					await captureTestEvidence(capture, LabSideEnum.node);
					step("waiting without observing abort");
					await resume.promise;
					step("late mutation");
					await captureTestEvidence(capture, LabSideEnum.browser);
					own(() => {
						throw new Error("late cleanup evidence");
					});
				},
			},
		],
	});
	const server = await createExampleServer({ port: 0, e2eRunner: runner });
	try {
		await fetch(`${server.origin}/api/e2e/start`, { method: "POST" });
		const finished = await waitForSnapshot(
			server.origin,
			(snapshot) => !snapshot.active && Boolean(snapshot.last),
			3_000,
		);
		assert.equal(released, true);
		assert.equal(finished.last?.status, "error");
		assert.equal(finished.last?.cleanupComplete, false);
		assert.equal(finished.last?.tests[0]?.status, "timed-out");
		assert.match(
			finished.last?.errors.join("\n") ?? "",
			/interruption did not reach resource cleanup/,
		);
		const retainedRecordings = finished.last?.tests[0]?.recordings.length;
		const retainedLogs = finished.last?.logs.length;
		resume.resolve();
		await delay(25);
		const afterLateUpdate = (await (
			await fetch(`${server.origin}/api/e2e`)
		).json()) as LabE2eSnapshot;
		assert.equal(
			afterLateUpdate.last?.tests[0]?.recordings.length,
			retainedRecordings,
		);
		assert.equal(afterLateUpdate.last?.logs.length, retainedLogs);
		const afterLateCleanup = await waitForSnapshot(server.origin, (snapshot) =>
			Boolean(
				snapshot.last?.errors.join("\n").includes("late cleanup evidence"),
			),
		);
		assert.equal(afterLateCleanup.last?.cleanupComplete, false);
	} finally {
		resume.resolve();
		await server.shutdown();
	}
});

test("EXAMPLE-LAB-E2E-003 malformed HTTP targets cannot crash the main Node", async () => {
	const server = await createExampleServer({ port: 0 });
	try {
		const response = await new Promise<string>((resolve, reject) => {
			const socket = connect(Number(new URL(server.origin).port), "127.0.0.1");
			let responseText = "";
			socket.setTimeout(2_000, () =>
				socket.destroy(new Error("Response timeout.")),
			);
			socket.on("error", reject);
			socket.on("data", (chunk) => {
				responseText += chunk.toString();
			});
			socket.on("end", () => resolve(responseText));
			socket.on("connect", () =>
				socket.write(
					"GET http://[ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
				),
			);
		});
		assert.match(response, /^HTTP\/1\.1 400 /);
		assert.equal((await fetch(`${server.origin}/health`)).status, 200);
	} finally {
		await server.shutdown();
	}
});

async function waitForSnapshot(
	origin: string,
	predicate: (snapshot: LabE2eSnapshot) => boolean,
	timeout = 15_000,
): Promise<LabE2eSnapshot> {
	const deadline = Date.now() + timeout;
	let snapshot: LabE2eSnapshot;
	do {
		snapshot = (await (
			await fetch(`${origin}/api/e2e`)
		).json()) as LabE2eSnapshot;
		if (predicate(snapshot)) return snapshot;
		await delay(25);
	} while (Date.now() < deadline);
	assert.fail(`Timed out observing E2E: ${JSON.stringify(snapshot)}`);
}

async function captureTestEvidence(
	capture: LabE2eCaseContext["capture"],
	side: LabSideEnum,
): Promise<void> {
	const recorder = createLabRecorder(side);
	const connectionId = recorder.allocateConnectionId();
	recorder.recordTransport("test evidence", 1, {
		type: "message",
		connectionId,
		direction: LabTransportDirectionEnum.sent,
		bytes: 1,
		outcome: "fulfilled",
	});
	await recorder.run(
		{
			traceId: "test-evidence",
			peerId: "test-peer",
			side,
			direction: RpcCallDirectionEnum.outgoing,
			service: "test.service",
			method: "run",
		},
		[],
		() => undefined,
	);
	recorder.recordEvent({
		type: RpcEventTypeEnum.ownerDraining,
	});
	capture({ side, snapshot: recorder.snapshot() });
}
