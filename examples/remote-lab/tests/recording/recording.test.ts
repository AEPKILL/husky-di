/**
 * @overview Evidence for bounded example recordings and full handshake capture at Transport boundaries.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import assert from "node:assert/strict";
import { it } from "node:test";
import { type IRpcConnection, RpcCallDirectionEnum } from "@husky-di/remote";
import { Subject } from "rxjs";
import {
	LabHandshakeKindEnum,
	LabSideEnum,
	LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";
import { createLabRecorder } from "@/factories/lab-recorder.factory";
import { createObservedConnectorAdapter } from "@/factories/observed-connector-adapter.factory";
import { parseLabHandshakeFrame } from "@/utils/parse-lab-handshake-frame.util";

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

it("EXAMPLE-LAB-RECORD-001 observes local admission once without exposing non-handshake Transport bytes", async () => {
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

it("EXAMPLE-LAB-RECORD-001 retains all handshake fields and original JSON in both directions once per message", async () => {
	const recorder = createLabRecorder(LabSideEnum.browser);
	const messages = new Subject<Uint8Array>();
	const connection: IRpcConnection = {
		message$: messages,
		async send() {},
		async close() {},
	};
	const connections = new Subject<IRpcConnection>();
	const adapter = createObservedConnectorAdapter(
		{
			connection$: connections,
			async connect() {
				connections.next(connection);
			},
		},
		recorder,
	);
	const observed: IRpcConnection[] = [];
	adapter.connection$.subscribe((value) => observed.push(value));
	adapter.connection$.subscribe((value) => observed.push(value));
	await adapter.connect(new AbortController().signal);
	assert.equal(observed[0], observed[1]);
	let received = 0;
	const first = observed[0].message$.subscribe(() => received++);
	const second = observed[0].message$.subscribe(() => received++);
	const sessionId = Buffer.alloc(32, 1).toString("base64url");
	const resumeToken = Buffer.alloc(32, 2).toString("base64url");
	const profile = "husky-di-rpc/1";
	const frames = [
		{ kind: "fresh", profiles: [profile] },
		{ kind: "accept", profile, sessionId, bindingEpoch: 1, resumeToken },
		{
			kind: "resume",
			profile,
			sessionId,
			resumeToken,
			receivedThrough: 7,
			resumeAttempt: 2,
		},
		{ kind: "accept", profile, sessionId, bindingEpoch: 2, receivedThrough: 8 },
		{ kind: "reject", code: "resume-rejected" },
	];
	for (const frame of frames) {
		const payload = JSON.stringify(
			{
				...frame,
				extension: { text: "完整字段".repeat(2_000), flags: [true, null] },
			},
			null,
			2,
		);
		const bytes = new TextEncoder().encode(payload);
		messages.next(bytes);
		await observed[0].send(bytes);
		const [sent, incoming] = recorder.snapshot().entries;
		assert.equal(sent.handshakeFrame?.payload, payload);
		assert.equal(incoming.handshakeFrame?.payload, payload);
		assert.equal(sent.handshakeFrame?.bytes, bytes.byteLength);
		assert.equal(incoming.handshakeFrame?.bytes, bytes.byteLength);
		assert.equal(
			sent.handshakeFrame?.direction,
			LabTransportDirectionEnum.sent,
		);
		assert.equal(
			incoming.handshakeFrame?.direction,
			LabTransportDirectionEnum.received,
		);
		assert.equal(sent.handshakeFrame?.type, frame.kind);
		assert.equal(incoming.handshakeFrame?.type, frame.kind);
		assert.equal(
			sent.handshakeFrame?.connectionId,
			incoming.handshakeFrame?.connectionId,
		);
		assert.equal(
			sent.handshakeFrame?.outcome,
			frame.kind === "reject" ? "failed" : "fulfilled",
		);
		assert.equal(
			incoming.handshakeFrame?.outcome,
			frame.kind === "reject" ? "failed" : "fulfilled",
		);
	}
	assert.equal(received, frames.length * 2);
	assert.equal(recorder.snapshot().entries.length, frames.length * 2);
	messages.complete();
	first.unsubscribe();
	second.unsubscribe();
});

it("EXAMPLE-LAB-RECORD-001 detaches handshake bytes before send settlement and preserves send errors", async () => {
	const recorder = createLabRecorder(LabSideEnum.browser);
	const connections = new Subject<IRpcConnection>();
	const messages = new Subject<Uint8Array>();
	let admit = () => {};
	const admission = new Promise<void>((resolve) => {
		admit = resolve;
	});
	const payload = JSON.stringify({
		kind: "resume",
		resumeToken: "complete-token",
	});
	const bytes = new TextEncoder().encode(payload);
	const failure = new Error("private Transport failure content");
	const connection: IRpcConnection = {
		message$: messages,
		send(value) {
			if (value === bytes) return admission;
			throw failure;
		},
		async close() {},
	};
	const adapter = createObservedConnectorAdapter(
		{
			connection$: connections,
			async connect() {
				connections.next(connection);
			},
		},
		recorder,
	);
	const observed: IRpcConnection[] = [];
	adapter.connection$.subscribe((value) => observed.push(value));
	await adapter.connect(new AbortController().signal);
	const subscription = observed[0].message$.subscribe();
	const sending = observed[0].send(bytes);
	assert.equal(recorder.snapshot().entries.length, 0);
	bytes.fill(0);
	admit();
	await sending;
	assert.equal(recorder.snapshot().entries[0].handshakeFrame?.payload, payload);
	const incoming = new TextEncoder().encode(payload);
	messages.next(incoming);
	incoming.fill(0);
	assert.equal(recorder.snapshot().entries[0].handshakeFrame?.payload, payload);
	const rejected = new TextEncoder().encode(payload);
	await assert.rejects(
		observed[0].send(rejected),
		(error) => error === failure,
	);
	assert.equal(
		recorder.snapshot().entries[0].handshakeFrame?.outcome,
		"failed",
	);
	assert.equal(recorder.snapshot().entries[0].handshakeFrame?.payload, payload);
	assert.equal(
		JSON.stringify(recorder.snapshot()).includes(failure.message),
		false,
	);
	const snapshot = recorder.snapshot();
	Object.assign(snapshot.entries[0].handshakeFrame ?? {}, {
		payload: "changed",
	});
	assert.equal(recorder.snapshot().entries[0].handshakeFrame?.payload, payload);
	messages.complete();
	subscription.unsubscribe();
});

it("EXAMPLE-LAB-RECORD-001 keeps malformed and oversized messages byte-only and bounds full handshake history", async () => {
	const recorder = createLabRecorder(LabSideEnum.browser);
	const connections = new Subject<IRpcConnection>();
	const messages = new Subject<Uint8Array>();
	const connection: IRpcConnection = {
		message$: messages,
		async send() {},
		async close() {},
	};
	const adapter = createObservedConnectorAdapter(
		{
			connection$: connections,
			async connect() {
				connections.next(connection);
			},
		},
		recorder,
	);
	const observed: IRpcConnection[] = [];
	adapter.connection$.subscribe((value) => observed.push(value));
	await adapter.connect(new AbortController().signal);
	const received: Uint8Array[] = [];
	const subscription = observed[0].message$.subscribe((value) =>
		received.push(value),
	);
	const invalid = [
		new Uint8Array([0xff]),
		...['{"kind":', "null", "[]", '"fresh"', "{}", '{"kind":"message"}'].map(
			(value) => new TextEncoder().encode(value),
		),
		new TextEncoder().encode('{"kind":"fresh"}'.padEnd(1_048_577, " ")),
	];
	for (const bytes of invalid) {
		messages.next(bytes);
		await observed[0].send(bytes);
	}
	assert.equal(recorder.snapshot().entries.length, invalid.length * 2);
	assert.ok(
		recorder.snapshot().entries.every((entry) => !entry.handshakeFrame),
	);
	assert.ok(received.every((value, index) => value === invalid[index]));
	const maximum = '{"kind":"fresh"}'.padEnd(1_048_576, " ");
	messages.next(new TextEncoder().encode(maximum));
	assert.equal(recorder.snapshot().entries[0].handshakeFrame?.payload, maximum);
	const originalId =
		recorder.snapshot().entries[0].handshakeFrame?.connectionId;
	for (let index = 0; index < 205; index++)
		messages.next(new TextEncoder().encode('{"kind":"fresh"}'));
	assert.equal(recorder.snapshot().entries.length, 200);
	recorder.clear();
	assert.equal(recorder.snapshot().entries.length, 0);
	const replacementConnections = new Subject<IRpcConnection>();
	const replacementAdapter = createObservedConnectorAdapter(
		{
			connection$: replacementConnections,
			async connect() {
				replacementConnections.next({ ...connection });
			},
		},
		recorder,
	);
	const replacement: IRpcConnection[] = [];
	replacementAdapter.connection$.subscribe((value) => replacement.push(value));
	await replacementAdapter.connect(new AbortController().signal);
	await replacement[0].send(new TextEncoder().encode('{"kind":"fresh"}'));
	assert.equal(
		recorder.snapshot().entries[0].handshakeFrame?.type,
		LabHandshakeKindEnum.fresh,
	);
	assert.notEqual(
		recorder.snapshot().entries[0].handshakeFrame?.connectionId,
		originalId,
	);
	messages.complete();
	subscription.unsubscribe();
});

it("EXAMPLE-LAB-NETWORK-001 associates fresh frames without changing payloads or prior snapshots and retains browser identity across clear", () => {
	const browser = createLabRecorder(LabSideEnum.browser);
	const node = createLabRecorder(LabSideEnum.node);
	const freshPayload =
		'{"kind":"fresh","profiles":["husky-di-rpc/1"],"sessionId":"extension-only"}';
	const fresh = parseLabHandshakeFrame(
		new TextEncoder().encode(freshPayload),
		"connection-1",
		LabTransportDirectionEnum.sent,
	);
	const accept = parseLabHandshakeFrame(
		new TextEncoder().encode('{"kind":"accept","sessionId":"current-session"}'),
		"connection-1",
		LabTransportDirectionEnum.received,
	);
	assert.ok(fresh && accept);
	assert.equal(fresh.sessionId, undefined);
	for (const recorder of [browser, node]) {
		recorder.recordTransport("fresh", fresh.bytes, fresh);
		recorder.recordTransport("unrelated fresh", fresh.bytes, {
			...fresh,
			connectionId: "connection-2",
		});
		const before = recorder.snapshot();
		recorder.recordTransport("accept", accept.bytes, accept);
		const after = recorder.snapshot();
		assert.equal(after.entries[2].handshakeFrame?.sessionId, "current-session");
		assert.equal(after.entries[2].handshakeFrame?.payload, freshPayload);
		assert.equal(after.entries[1].handshakeFrame?.sessionId, undefined);
		assert.equal(before.entries[1].handshakeFrame?.sessionId, undefined);
		assert.equal(fresh.sessionId, undefined);
		Object.assign(after.entries[2].handshakeFrame ?? {}, {
			sessionId: "changed",
		});
		assert.equal(
			recorder.snapshot().entries[2].handshakeFrame?.sessionId,
			"current-session",
		);
		recorder.clear();
		assert.equal(recorder.snapshot().entries.length, 0);
		for (let index = 0; index < 205; index++)
			recorder.recordTransport("noise", 1);
		assert.equal(recorder.snapshot().entries.length, 200);
	}
	assert.equal(browser.snapshot().sessionId, "current-session");
	assert.equal(node.snapshot().sessionId, undefined);
	browser.recordTransport("other accept", accept.bytes, {
		...accept,
		sessionId: "other-session",
	});
	assert.equal(browser.snapshot().sessionId, "current-session");
});

it("EXAMPLE-LAB-NETWORK-001 retains connection association through delayed sends, recovery history eviction, and clear", async () => {
	const recorder = createLabRecorder(LabSideEnum.browser);
	const connections = new Subject<IRpcConnection>();
	const messages = new Subject<Uint8Array>();
	let admit = () => {};
	const admission = new Promise<void>((resolve) => {
		admit = resolve;
	});
	const connection: IRpcConnection = {
		message$: messages,
		send: () => admission,
		async close() {},
	};
	const adapter = createObservedConnectorAdapter(
		{
			connection$: connections,
			async connect() {
				connections.next(connection);
			},
		},
		recorder,
	);
	const observed: IRpcConnection[] = [];
	adapter.connection$.subscribe((value) => observed.push(value));
	await adapter.connect(new AbortController().signal);
	const subscription = observed[0].message$.subscribe();
	const encode = (value: object) =>
		new TextEncoder().encode(JSON.stringify(value));
	const sending = observed[0].send(encode({ kind: "fresh" }));
	messages.next(encode({ kind: "accept", sessionId: "current-session" }));
	admit();
	await sending;
	assert.ok(
		recorder
			.snapshot()
			.entries.every(
				(entry) => entry.handshakeFrame?.sessionId === "current-session",
			),
	);
	const originalConnection =
		recorder.snapshot().entries[0].handshakeFrame?.connectionId;
	connections.next({ ...connection, async send() {} });
	await observed[1].send(
		encode({ kind: "resume", sessionId: "current-session" }),
	);
	const replacementConnection =
		recorder.snapshot().entries[0].handshakeFrame?.connectionId;
	assert.notEqual(replacementConnection, originalConnection);
	for (let index = 0; index < 205; index++)
		recorder.recordTransport("noise", 1);
	assert.ok(
		recorder.snapshot().entries.every((entry) => !entry.handshakeFrame),
	);
	const reject = encode({ kind: "reject", code: "resume-rejected" });
	await observed[1].send(reject);
	assert.equal(
		recorder.snapshot().entries[0].handshakeFrame?.sessionId,
		"current-session",
	);
	assert.equal(
		recorder.snapshot().entries[0].handshakeFrame?.connectionId,
		replacementConnection,
	);
	assert.equal(
		recorder.snapshot().entries[0].handshakeFrame?.payload,
		new TextDecoder().decode(reject),
	);
	recorder.clear();
	await observed[1].send(reject);
	assert.equal(
		recorder.snapshot().entries[0].handshakeFrame?.sessionId,
		"current-session",
	);
	assert.equal(recorder.snapshot().sessionId, "current-session");
	connections.next({ ...connection, async send() {} });
	await observed[2].send(reject);
	assert.equal(
		recorder.snapshot().entries[0].handshakeFrame?.sessionId,
		undefined,
	);
	messages.complete();
	connections.complete();
	subscription.unsubscribe();
});
