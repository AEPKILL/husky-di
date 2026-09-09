/**
 * @overview Evidence for bounded example recording without changing RPC payload inspection.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import assert from "node:assert/strict";
import { it } from "node:test";
import { type IRpcConnection, RpcCallDirectionEnum } from "@husky-di/remote";
import { Subject } from "rxjs";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import { createLabRecorder } from "@/factories/lab-recorder.factory";
import { createObservedConnectorAdapter } from "@/factories/observed-connector-adapter.factory";

it("EXAMPLE-LAB-RECORD-001 retains live calls independently of bounded history and clear", async () => {
	const recorder = createLabRecorder(LabSideEnum.browser);
	const context = {
		traceId: "slow",
		peerId: "test",
		side: LabSideEnum.browser,
		direction: RpcCallDirectionEnum.outgoing,
		service: "example",
		method: "run",
	};
	let finish = () => {};
	const slow = recorder.run(
		context,
		[],
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	for (let index = 0; index < 110; index += 1)
		await recorder.run(
			{ ...context, traceId: `fast-${index}` },
			[index],
			() => index,
		);
	assert.equal(recorder.snapshot().calls.length, 101);
	assert.equal(recorder.snapshot().entries.length, 200);
	assert.equal(
		recorder.snapshot().calls.find((call) => call.traceId === "slow")?.outcome,
		"pending",
	);
	recorder.clear();
	assert.equal(recorder.snapshot().calls.length, 1);
	finish();
	await slow;
	assert.equal(recorder.snapshot().calls[0].outcome, "fulfilled");
});

it("EXAMPLE-LAB-RECORD-001 observes local admission once without inspecting or changing Transport bytes", async () => {
	const recorder = createLabRecorder(LabSideEnum.browser);
	const connections = new Subject<IRpcConnection>();
	const messages = new Subject<Uint8Array>();
	let admit = () => {};
	const admission = new Promise<void>((resolve) => {
		admit = resolve;
	});
	const bytes = new TextEncoder().encode("never show raw credentials");
	const connection: IRpcConnection = {
		message$: messages,
		send(value) {
			assert.equal(value, bytes);
			return admission;
		},
		async close() {},
	};
	const adapter = createObservedConnectorAdapter(
		{
			connection$: connections,
			async connect() {
				connections.next(connection);
				connections.complete();
			},
		},
		recorder,
	);
	const observed: IRpcConnection[] = [];
	adapter.connection$.subscribe((value) => observed.push(value));
	adapter.connection$.subscribe((value) => observed.push(value));
	await adapter.connect(new AbortController().signal);
	assert.equal(observed[0], observed[1]);
	const first = observed[0].message$.subscribe((value) =>
		assert.equal(value, bytes),
	);
	const second = observed[0].message$.subscribe((value) =>
		assert.equal(value, bytes),
	);
	messages.next(bytes);
	assert.equal(recorder.snapshot().entries.length, 1);
	const sending = observed[0].send(bytes);
	assert.equal(recorder.snapshot().entries.length, 1);
	admit();
	await sending;
	assert.equal(recorder.snapshot().entries.length, 2);
	assert.match(recorder.snapshot().entries[0].summary, /locally admitted/);
	assert.equal(
		JSON.stringify(recorder.snapshot()).includes("never show raw credentials"),
		false,
	);
	messages.complete();
	first.unsubscribe();
	second.unsubscribe();
});

it("EXAMPLE-LAB-RECORD-001 snapshots safely without invoking payload getters or toJSON", async () => {
	const recorder = createLabRecorder(LabSideEnum.browser);
	let reads = 0;
	const input = {
		get secret() {
			reads += 1;
			return "secret";
		},
		toJSON() {
			reads += 1;
			return "secret";
		},
	};
	const context = {
		traceId: "safe",
		peerId: "test",
		side: LabSideEnum.browser,
		direction: RpcCallDirectionEnum.outgoing,
		service: "example",
		method: "run",
	};
	const error = new TypeError("private error content");
	await assert.rejects(
		recorder.run(context, [input], () => {
			throw error;
		}),
		(value) => value === error,
	);
	assert.equal(reads, 0);
	assert.equal(recorder.snapshot().calls[0].outcome, "TypeError");
	assert.ok(recorder.snapshot().calls[0].arguments.includes("[accessor]"));
	assert.equal(
		JSON.stringify(recorder.snapshot()).includes("private error content"),
		false,
	);
	const result = { value: "before" };
	await recorder.run({ ...context, traceId: "detached" }, [], () => result);
	result.value = "after";
	assert.ok(
		recorder
			.snapshot()
			.calls.find((call) => call.traceId === "detached")
			?.result?.includes("before"),
	);
});
