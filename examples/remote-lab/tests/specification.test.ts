/**
 * @overview Executable evidence for browser/Node RPC example requirements over real WebSockets.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	createRpcConnector,
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
	RpcCloseOutcomeEnum,
	RpcCloseReasonEnum,
	RpcEventTypeEnum,
	RpcException,
	RpcExceptionCodeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NEVER } from "rxjs";
import { REMOTE_LAB_SERVICE } from "@/consts/lab-services.const";
import { REMOTE_GREETING_SERVICE } from "@/consts/remote-services.const";
import {
	LabHandshakeKindEnum,
	LabSideEnum,
	LabSourceEnum,
	LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";
import { createExampleClient } from "@/factories/example-client.factory";
import { createExampleServer } from "@/factories/example-server.factory";
import { createLabRecorder } from "@/factories/lab-recorder.factory";
import { createObservedConnectorAdapter } from "@/factories/observed-connector-adapter.factory";
import { createRpcDiagnostics } from "@/factories/rpc-diagnostics.factory";
import type { LabCallRecord, LabLogEntry } from "@/types/lab-recording.type";
import type {
	LabClearResult,
	LabServerSnapshot,
} from "@/types/lab-server.type";
import type { NodeDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";
import { EndpointBadge } from "@/web/components/devtools/endpoint-badge";
import { WorkbenchHeader } from "@/web/components/workbench-header";
import { formatDevtoolsJson } from "@/web/utils/format-devtools-json.util";
import { getPeerStatusLabel } from "@/web/utils/get-peer-status-label.util";
import { selectNetworkRecords } from "@/web/utils/select-network-records.util";
import "./lab/lab-scenarios.test";
import "./recording/recording.test";

describe("Remote Lab specification", () => {
	it("EXAMPLE-LAB-CLEAR-001 clears shared Node history and counters while preserving paused calls, identity, and continued RPC", async () => {
		const server = await createExampleServer({ port: 0 });
		const clients = Array.from({ length: 2 }, () =>
			createExampleClient({
				adapterFactory: () =>
					createWebSocketConnectorAdapter({
						url: `${server.origin.replace("http:", "ws:")}/rpc`,
					}),
				display: { showMessage: () => "Clear test browser" },
			}),
		);
		try {
			await Promise.all(clients.map((client) => client.reconnection.connect()));
			const controls = clients.map((client) =>
				client.connector.peer.resolve(REMOTE_LAB_SERVICE),
			);
			const identities = await Promise.all(
				controls.map(async (control) =>
					Promise.all([control.identify(), control.identifyServer()]),
				),
			);
			assert.notEqual(identities[0][0], identities[1][0]);
			assert.equal(identities[0][1], identities[1][1]);
			await Promise.all(
				controls.map((control, index) =>
					control.echo(`completed-${index}`, index),
				),
			);
			const report = controls[0].report(
				"retained-report",
				true,
				0,
				new AbortController().signal,
			);
			void report.catch(() => {});
			await eventually(async () => {
				const lab: LabServerSnapshot = await (
					await fetch(`${server.origin}/api/lab`)
				).json();
				return lab.pausedReports.some(
					(paused) => paused.traceId === "retained-report",
				);
			});
			const before: LabServerSnapshot = await (
				await fetch(`${server.origin}/api/lab`)
			).json();
			const pending = (await snapshot(server.origin)).pendingCalls;
			assert.equal(
				before.recording.calls.filter((call) => call.outcome === "fulfilled")
					.length,
				2,
			);
			assert.ok(before.recording.entries.length > 0);
			const response = await fetch(`${server.origin}/api/lab/records`, {
				method: "DELETE",
			});
			assert.equal(response.status, 200);
			assert.equal(response.headers.get("cache-control"), "no-store");
			const cleared: LabClearResult = await response.json();
			assert.equal(cleared.lab.instanceId, identities[0][1]);
			assert.deepEqual(cleared.lab.peers, before.peers);
			assert.equal(cleared.lab.globalExposure, before.globalExposure);
			assert.deepEqual(cleared.lab.pausedReports, before.pausedReports);
			assert.deepEqual(
				cleared.lab.recording.calls.map((call) => [call.traceId, call.outcome]),
				[["retained-report", "pending"]],
			);
			assert.deepEqual(cleared.lab.recording.entries, []);
			assert.deepEqual(cleared.diagnostics, {
				totalEvents: 0,
				recentEvents: [],
				pendingCalls: pending,
			});
			assert.equal((await snapshot(server.origin)).totalEvents, 0);
			assert.equal(await controls[0].resume("retained-report"), true);
			assert.equal((await report).handlerEntries, 1);
			assert.equal(
				await controls[1].echo("after-clear", "still connected"),
				"still connected",
			);
			assert.deepEqual(
				await Promise.all(
					controls.map(async (control) =>
						Promise.all([control.identify(), control.identifyServer()]),
					),
				),
				identities,
			);
			const after: LabServerSnapshot = await (
				await fetch(`${server.origin}/api/lab`)
			).json();
			assert.ok(
				after.recording.calls.every(
					(call) => !call.traceId.startsWith("completed-"),
				),
			);
			assert.ok(
				after.recording.calls.some(
					(call) =>
						call.traceId === "retained-report" && call.outcome === "fulfilled",
				),
			);
			assert.equal((await snapshot(server.origin)).pendingCalls.length, 0);
			assert.ok((await snapshot(server.origin)).totalEvents > 0);
		} finally {
			await Promise.all([
				...clients.map((client) => client.shutdown()),
				server.shutdown(),
			]);
		}
	});

	it("EXAMPLE-LAB-NETWORK-001 scopes calls and handshakes to the current Connector and its Acceptor counterpart", () => {
		const browser: LabCallRecord = {
			id: "browser-call",
			side: LabSideEnum.browser,
			peerId: "peer-1",
			direction: RpcCallDirectionEnum.outgoing,
			traceId: "own-trace",
			service: "shipping",
			method: "quote",
			startedAt: 1,
			outcome: "fulfilled",
			arguments: "[]",
			phases: [],
		};
		const node: LabCallRecord = {
			...browser,
			side: LabSideEnum.node,
			direction: RpcCallDirectionEnum.incoming,
		};
		const calls = [
			browser,
			{ ...node, id: "own-peer-call" },
			{ ...node, id: "own-global-call", peerId: "acceptor" },
			{ ...node, id: "other-peer-call", peerId: "peer-2" },
			{
				...node,
				id: "other-global-call",
				peerId: "acceptor",
				traceId: "other-trace",
			},
			{ ...node, id: "wrong-service", peerId: "acceptor", service: "other" },
			{ ...node, id: "wrong-method", peerId: "acceptor", method: "other" },
			{
				...node,
				id: "wrong-direction",
				peerId: "acceptor",
				direction: RpcCallDirectionEnum.outgoing,
			},
		];
		const frame = {
			type: LabHandshakeKindEnum.fresh,
			connectionId: "Node-connection-1",
			sessionId: "own-session",
			direction: LabTransportDirectionEnum.received,
			bytes: 16,
			outcome: "fulfilled",
			payload: '{"kind":"fresh"}',
		};
		const nodeEntry = {
			at: 1,
			source: LabSourceEnum.transport,
			summary: "frame",
			side: LabSideEnum.node,
		};
		const entries: (LabLogEntry & { side: LabSideEnum })[] = [
			{
				...nodeEntry,
				id: "browser-frame",
				side: LabSideEnum.browser,
				handshakeFrame: { ...frame, sessionId: undefined },
			},
			{ ...nodeEntry, id: "own-fresh", handshakeFrame: frame },
			{
				...nodeEntry,
				id: "own-recovery",
				handshakeFrame: {
					...frame,
					type: LabHandshakeKindEnum.reject,
					connectionId: "Node-connection-2",
				},
			},
			{
				...nodeEntry,
				id: "other-session",
				handshakeFrame: { ...frame, sessionId: "other-session" },
			},
			{
				...nodeEntry,
				id: "unattributed-frame",
				handshakeFrame: { ...frame, sessionId: undefined },
			},
			{
				...nodeEntry,
				id: "own-event",
				handshake: {
					type: RpcEventTypeEnum.peerOpened,
					peerId: "peer-1",
					outcome: "fulfilled",
				},
			},
			{
				...nodeEntry,
				id: "other-event",
				handshake: {
					type: RpcEventTypeEnum.peerOpened,
					peerId: "peer-2",
					outcome: "fulfilled",
				},
			},
		];
		const current = {
			peerId: "peer-1",
			sessionId: "own-session",
			calls,
			entries,
		};
		const selected = selectNetworkRecords(current);
		assert.deepEqual(
			selected.calls.map((call) => call.id),
			["browser-call", "own-peer-call", "own-global-call"],
		);
		assert.deepEqual(
			selected.entries.map((entry) => entry.id),
			["browser-frame", "own-fresh", "own-recovery", "own-event"],
		);
		assert.equal(selected.entries[1].handshakeFrame?.payload, frame.payload);
		assert.equal(calls.length, 8);
		assert.equal(entries.length, 7);
		const cleared = selectNetworkRecords({
			...current,
			calls: calls.slice(1),
			entries: entries.slice(1),
		});
		assert.deepEqual(
			cleared.calls.map((call) => call.id),
			["own-peer-call"],
		);
		assert.deepEqual(
			cleared.entries.map((entry) => entry.id),
			["own-fresh", "own-recovery", "own-event"],
		);
		const unconnected = selectNetworkRecords({
			...current,
			peerId: undefined,
			sessionId: undefined,
		});
		assert.deepEqual(
			unconnected.calls.map((call) => call.id),
			["browser-call", "own-global-call"],
		);
		assert.deepEqual(
			unconnected.entries.map((entry) => entry.id),
			["browser-frame"],
		);
	});

	it("EXAMPLE-LAB-WORKBENCH-001 uses a decorative flask-conical icon beside the Lab name", () => {
		const header = renderToStaticMarkup(
			createElement(WorkbenchHeader, {
				texts: {},
				transportStatus: RpcStateStatusEnum.connected,
				onAction() {},
			}),
		);
		assert.match(
			header,
			/<span class="logo" aria-hidden="true"><svg[^>]*lucide-flask-conical/,
		);
		assert.ok(header.includes("<strong>remote lab</strong>"));
	});

	it("EXAMPLE-LAB-HANDSHAKE-001 retains only detached bounded safe lifecycle metadata", async () => {
		const connector = createRpcConnector();
		const recorder = createLabRecorder(LabSideEnum.browser);
		try {
			for (const type of [
				RpcEventTypeEnum.peerOpened,
				RpcEventTypeEnum.peerRecovering,
				RpcEventTypeEnum.peerRecovered,
			] as const) {
				const event = {
					type,
					peer: connector.peer,
					credentials: "unrecorded credential",
				};
				recorder.recordEvent(event, "browser-1");
			}
			for (const terminal of [
				{
					outcome: RpcCloseOutcomeEnum.normal,
					reason: RpcCloseReasonEnum.forcedClose,
				},
				{
					outcome: RpcCloseOutcomeEnum.failed,
					reason: RpcCloseReasonEnum.recoveryExpired,
				},
			] as const) {
				recorder.recordEvent(
					{
						...terminal,
						type: RpcEventTypeEnum.peerClosed,
						peer: connector.peer,
					},
					"browser-1",
				);
			}
			const snapshot = recorder.snapshot();
			assert.deepEqual(
				snapshot.entries.map((entry) => entry.handshake),
				[
					{
						type: RpcEventTypeEnum.peerClosed,
						peerId: "browser-1",
						outcome: RpcCloseOutcomeEnum.failed,
						reason: RpcCloseReasonEnum.recoveryExpired,
					},
					{
						type: RpcEventTypeEnum.peerClosed,
						peerId: "browser-1",
						outcome: RpcCloseOutcomeEnum.normal,
						reason: RpcCloseReasonEnum.forcedClose,
					},
					{
						type: RpcEventTypeEnum.peerRecovered,
						peerId: "browser-1",
						outcome: "fulfilled",
					},
					{
						type: RpcEventTypeEnum.peerRecovering,
						peerId: "browser-1",
						outcome: "pending",
					},
					{
						type: RpcEventTypeEnum.peerOpened,
						peerId: "browser-1",
						outcome: "fulfilled",
					},
				],
			);
			assert.ok(
				snapshot.entries.every(
					(entry) => entry.source === LabSourceEnum.rpc && entry.at > 0,
				),
			);
			assert.doesNotMatch(
				JSON.stringify(snapshot),
				/credentials|"peer":|"state":|durationMs|resumeToken/,
			);
			assert.ok(snapshot.entries[0].handshake);
			Object.assign(snapshot.entries[0].handshake, { peerId: "mutated" });
			assert.equal(
				recorder.snapshot().entries[0].handshake?.peerId,
				"browser-1",
			);
			recorder.recordEvent({ type: RpcEventTypeEnum.ownerDraining });
			assert.equal("handshake" in recorder.snapshot().entries[0], false);
			for (let index = 0; index < 205; index += 1)
				recorder.recordEvent({
					type: RpcEventTypeEnum.peerOpened,
					peer: connector.peer,
				});
			assert.equal(recorder.snapshot().entries.length, 200);
			recorder.clear();
			assert.deepEqual(recorder.snapshot().entries, []);
		} finally {
			await connector.shutdown();
		}
	});

	it("EXAMPLE-LAB-DEVTOOLS-001 identifies endpoint owners with text and decorative icons", () => {
		for (const [side, owner] of [
			[LabSideEnum.browser, "Connector"],
			[LabSideEnum.node, "Acceptor"],
		] as const) {
			const badge = renderToStaticMarkup(
				createElement(EndpointBadge, { side }),
			);
			assert.ok(badge.includes(`data-owner="${owner.toLowerCase()}"`));
			assert.ok(badge.includes(owner));
			assert.match(badge, /<svg[^>]*aria-hidden="true"/);
			assert.doesNotMatch(badge, /outgoing|incoming/);
		}
	});

	it("EXAMPLE-LAB-DEVTOOLS-001 formats recorded JSON and preserves bounded non-JSON previews", () => {
		const preview =
			'[{"message":"<script>sample</script>","items":[1,true,null]}]';
		const formatted = formatDevtoolsJson(preview);
		assert.deepEqual(JSON.parse(formatted), JSON.parse(preview));
		assert.ok(formatted.includes('\n  {\n    "message":'));
		assert.ok(
			formatted.includes(
				'\n    "items": [\n      1,\n      true,\n      null\n    ]',
			),
		);
		for (const marker of [
			"[unsupported object]",
			'[{"value": undefined}]',
			"[cycle]",
			"handler-failed",
			'["truncated…',
		])
			assert.equal(formatDevtoolsJson(marker), marker);
		for (const primitive of ["null", "true", "12.5", '"hello"'])
			assert.equal(formatDevtoolsJson(primitive), primitive);
	});

	it("EXAMPLE-WS-STATE-001 labels actual disconnection separately from reconnection attempts", () => {
		const labels = [
			[RpcStateStatusEnum.unbound, "Not connected"],
			[RpcStateStatusEnum.connecting, "Connecting"],
			[RpcStateStatusEnum.connected, "Live transport"],
			[RpcStateStatusEnum.recovering, "Transport disconnected"],
			[RpcStateStatusEnum.draining, "Disconnecting"],
			[RpcStateStatusEnum.closed, "Connection closed"],
		] as const;
		for (const [status, expected] of labels)
			assert.equal(getPeerStatusLabel(status), expected);
	});

	it("EXAMPLE-WS-OBSERVE-001 EXAMPLE-LAB-CLEAR-001 retains pending calls after history eviction and clearing diagnostic counters", async () => {
		const connector = createRpcConnector();
		try {
			const diagnostics = createRpcDiagnostics();
			const call = {
				peer: connector.peer,
				direction: RpcCallDirectionEnum.outgoing,
				service: "greeting",
				method: "greet",
			};
			diagnostics.record({
				...call,
				type: RpcEventTypeEnum.callStarted,
				observationId: "slow",
			});
			for (let index = 0; index < 30; index += 1) {
				diagnostics.record({
					...call,
					type: RpcEventTypeEnum.callStarted,
					observationId: `fast-${index}`,
				});
				diagnostics.record({
					...call,
					type: RpcEventTypeEnum.callFinished,
					observationId: `fast-${index}`,
					outcome: RpcCallStatusEnum.fulfilled,
					durationMs: 1,
				});
			}
			assert.equal(diagnostics.snapshot().recentEvents.length, 24);
			assert.deepEqual(
				diagnostics.snapshot().pendingCalls.map((call) => call.observationId),
				["slow"],
			);
			const retained = diagnostics.snapshot();
			diagnostics.clear();
			assert.deepEqual(diagnostics.snapshot(), {
				totalEvents: 0,
				recentEvents: [],
				pendingCalls: retained.pendingCalls,
			});
			assert.equal(retained.totalEvents, 61);
			diagnostics.record({
				...call,
				type: RpcEventTypeEnum.callFinished,
				observationId: "slow",
				outcome: RpcCallStatusEnum.fulfilled,
				durationMs: 100,
			});
			assert.equal(diagnostics.snapshot().pendingCalls.length, 0);
			assert.equal(diagnostics.snapshot().totalEvents, 1);
		} finally {
			await connector.shutdown();
		}
	});

	it("EXAMPLE-WS-RECOVERY-001 leaves initial failure observable without application retries", async () => {
		let attempts = 0;
		const client = createExampleClient({
			adapterFactory: () => {
				attempts += 1;
				return {
					connection$: NEVER,
					async connect() {
						throw new Error("Offline");
					},
				};
			},
			display: { showMessage: () => "test page" },
		});
		try {
			await assert.rejects(client.reconnection.connect());
			assert.equal(
				client.reconnection.state.status,
				RpcStateStatusEnum.stopped,
			);
			assert.equal(attempts, 1);
			assert.equal(client.shutdown(), client.shutdown());
			await client.shutdown();
			assert.equal(client.connector.state.status, RpcStateStatusEnum.closed);
		} finally {
			await client.shutdown();
		}
	});

	it("EXAMPLE-WS-RECOVERY-001 / EXAMPLE-LAB-HANDSHAKE-001 retains its call and records complete wire handshakes and lifecycle observations across socket replacement", {
		timeout: 10_000,
	}, async () => {
		const server = await createExampleServer({ port: 0 });
		const sockets: WebSocket[] = [];
		class ObservedWebSocketImpl extends WebSocket {
			constructor(url: string | URL, protocols?: string | string[]) {
				super(url, protocols);
				sockets.push(this);
			}
		}
		let attempts = 0;
		const recorder = createLabRecorder(LabSideEnum.browser);
		const client = createExampleClient({
			adapterFactory: () => {
				attempts += 1;
				return createObservedConnectorAdapter(
					createWebSocketConnectorAdapter({
						url: `${server.origin.replace("http:", "ws:")}/rpc`,
						webSocket: ObservedWebSocketImpl,
					}),
					recorder,
				);
			},
			display: { showMessage: () => "Recovery test" },
		});
		const states: RpcStateStatusEnum[] = [];
		const state = client.connector.peer.state$.subscribe((value) =>
			states.push(value.status),
		);
		const shutdownOrder: string[] = [];
		const supervision = client.reconnection.state$.subscribe((value) => {
			if (value.status === RpcStateStatusEnum.stopped)
				shutdownOrder.push("stop");
		});
		const events = client.connector.event$.subscribe((value) => {
			recorder.recordEvent(value, "browser-1");
			if (value.type === RpcEventTypeEnum.ownerDraining)
				shutdownOrder.push("drain");
		});
		try {
			await client.reconnection.connect();
			const peer = client.connector.peer;
			assert.equal(
				recorder.snapshot().entries.find((entry) => entry.handshake)?.handshake
					?.type,
				RpcEventTypeEnum.peerOpened,
			);
			const greeter = peer.resolve(REMOTE_GREETING_SERVICE);
			assert.equal(await greeter.ready(), "Recovery test");
			const pending = greeter.greet("Recovery", 250);
			await eventually(async () =>
				(await snapshot(server.origin)).pendingCalls.some(
					(call) => call.method === "greet",
				),
			);
			sockets[0].close();
			assert.equal(await pending, "Hello, Recovery!");
			assert.equal(client.connector.peer, peer);
			assert.equal(attempts, 2);
			assert.equal(sockets.length, 2);
			assert.ok(states.includes(RpcStateStatusEnum.recovering));
			assert.equal(
				client.connector.peer.state.status,
				RpcStateStatusEnum.connected,
			);
			assert.equal(await greeter.greet("Still here", 0), "Hello, Still here!");
			const nodeLab: LabServerSnapshot = await (
				await fetch(`${server.origin}/api/lab`)
			).json();
			const browserRecording = recorder.snapshot();
			const diagnostics = JSON.stringify(await snapshot(server.origin));
			for (const [side, recording] of [
				[LabSideEnum.browser, browserRecording],
				[LabSideEnum.node, nodeLab.recording],
			] as const) {
				const handshakes = recording.entries.flatMap((entry) =>
					entry.handshake ? [entry.handshake] : [],
				);
				assert.deepEqual(
					handshakes.map((event) => event.type),
					[
						RpcEventTypeEnum.peerRecovered,
						RpcEventTypeEnum.peerRecovering,
						RpcEventTypeEnum.peerOpened,
					],
				);
				assert.equal(new Set(handshakes.map((event) => event.peerId)).size, 1);
				const frames = recording.entries.flatMap((entry) =>
					entry.handshakeFrame
						? [
								{
									entry,
									frame: entry.handshakeFrame,
									payload: JSON.parse(entry.handshakeFrame.payload) as Record<
										string,
										unknown
									>,
								},
							]
						: [],
				);
				assert.equal(frames.length, 4);
				for (const { entry, frame, payload } of frames) {
					assert.equal(entry.source, LabSourceEnum.transport);
					assert.equal(frame.type, payload.kind);
					assert.equal(frame.outcome, "fulfilled");
					assert.equal(
						frame.bytes,
						new TextEncoder().encode(frame.payload).byteLength,
					);
					const connectorSent =
						frame.type === LabHandshakeKindEnum.fresh ||
						frame.type === LabHandshakeKindEnum.resume;
					assert.equal(
						frame.direction,
						connectorSent === (side === LabSideEnum.browser)
							? LabTransportDirectionEnum.sent
							: LabTransportDirectionEnum.received,
					);
				}
				const fresh = frames.find(
					({ frame }) => frame.type === LabHandshakeKindEnum.fresh,
				);
				const freshAccept = frames.find(
					({ frame, payload }) =>
						frame.type === LabHandshakeKindEnum.accept &&
						"resumeToken" in payload,
				);
				const resume = frames.find(
					({ frame }) => frame.type === LabHandshakeKindEnum.resume,
				);
				const resumeAccept = frames.find(
					({ frame, payload }) =>
						frame.type === LabHandshakeKindEnum.accept &&
						"receivedThrough" in payload,
				);
				assert.ok(fresh && freshAccept && resume && resumeAccept);
				assert.deepEqual(fresh.payload.profiles, ["husky-di-rpc/1"]);
				for (const { payload } of [freshAccept, resume, resumeAccept]) {
					assert.equal(payload.profile, "husky-di-rpc/1");
					assert.ok(
						typeof payload.sessionId === "string" &&
							/^[A-Za-z0-9_-]{43}$/.test(payload.sessionId),
					);
					assert.ok(payload.sessionId === freshAccept.payload.sessionId);
				}
				const token = freshAccept.payload.resumeToken;
				assert.ok(
					typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token),
				);
				assert.ok(resume.payload.resumeToken === token);
				assert.ok(!("resumeToken" in resumeAccept.payload));
				assert.equal(freshAccept.payload.bindingEpoch, 1);
				assert.equal(resumeAccept.payload.bindingEpoch, 2);
				assert.equal(resume.payload.resumeAttempt, 1);
				for (const { payload } of [resume, resumeAccept])
					assert.ok(
						typeof payload.receivedThrough === "number" &&
							Number.isSafeInteger(payload.receivedThrough) &&
							payload.receivedThrough > 0,
					);
				assert.equal(fresh.frame.connectionId, freshAccept.frame.connectionId);
				assert.equal(
					resume.frame.connectionId,
					resumeAccept.frame.connectionId,
				);
				assert.notEqual(fresh.frame.connectionId, resume.frame.connectionId);
				assert.ok(!diagnostics.includes(token));
				assert.doesNotMatch(diagnostics, /resumeToken|handshakeFrame/);
			}
			const [browserPayloads, nodePayloads] = [
				browserRecording,
				nodeLab.recording,
			].map((recording) =>
				recording.entries
					.flatMap((entry) =>
						entry.handshakeFrame ? [entry.handshakeFrame.payload] : [],
					)
					.sort(),
			);
			assert.ok(
				JSON.stringify(browserPayloads) === JSON.stringify(nodePayloads),
				"Both endpoints must retain the same complete handshake payloads.",
			);
			await client.shutdown();
			assert.deepEqual(shutdownOrder, ["stop", "drain"]);
			assert.deepEqual(
				recorder.snapshot().entries.find((entry) => entry.handshake)?.handshake,
				{
					type: RpcEventTypeEnum.peerClosed,
					peerId: "browser-1",
					outcome: RpcCloseOutcomeEnum.normal,
					reason: RpcCloseReasonEnum.gracefulShutdown,
				},
			);
		} finally {
			state.unsubscribe();
			supervision.unsubscribe();
			events.unsubscribe();
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-WS-LIFETIME-001 drains an in-flight proxied call before SIGTERM exits the dev process", {
		timeout: 15_000,
	}, async () => {
		const child = spawn(
			process.execPath,
			["--import", "tsx", "src/server/dev.ts"],
			{
				cwd: fileURLToPath(new URL("..", import.meta.url)),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		const exited = new Promise<{
			code: number | null;
			signal: NodeJS.Signals | null;
		}>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => resolve({ code, signal }));
		});
		const client = createExampleClient({
			adapterFactory: () =>
				createWebSocketConnectorAdapter({ url: "ws://127.0.0.1:5173/rpc" }),
			display: { showMessage: () => "Signal test browser" },
		});
		try {
			await eventually(() => {
				assert.equal(child.exitCode, null, output);
				return output.includes("http://127.0.0.1:5173");
			});
			assert.equal((await fetch("http://127.0.0.1:5173/")).status, 200);
			await client.reconnection.connect();
			const greeter = client.connector.peer.resolve(REMOTE_GREETING_SERVICE);
			assert.equal(await greeter.ready(), "Signal test browser");
			const pending = greeter.greet("Signal drain", 500);
			// Observe the server's admitted handler, then deliver SIGTERM to the actual owner process.
			await eventually(async () =>
				(await snapshot("http://127.0.0.1:3000")).pendingCalls.some(
					(call) => call.method === "greet",
				),
			);
			assert.equal(child.kill("SIGTERM"), true);
			assert.equal(
				await Promise.race([
					pending,
					exited.then((result) => {
						throw new Error(
							`Dev process exited before RPC drain: ${JSON.stringify(result)}`,
						);
					}),
				]),
				"Hello, Signal drain!",
			);
			assert.deepEqual(await exited, { code: 0, signal: null }, output);
			await assert.rejects(fetch("http://127.0.0.1:3000/health"));
			await assert.rejects(fetch("http://127.0.0.1:5173/"));
		} finally {
			if (child.exitCode === null && child.signalCode === null)
				child.kill("SIGKILL");
			await exited;
			await client.shutdown();
		}
	});

	it("EXAMPLE-WS-RPC-001 / OBSERVE-001 / LIFETIME-001 runs both RPC directions, parallel delayed calls and graceful draining", {
		timeout: 10_000,
	}, async () => {
		const server = await createExampleServer({ port: 0 });
		const messages: string[] = [];
		const client = createExampleClient({
			adapterFactory: () =>
				createWebSocketConnectorAdapter({
					url: `${server.origin.replace("http:", "ws:")}/rpc`,
				}),
			display: {
				showMessage(message) {
					messages.push(message);
					return "Example test browser";
				},
			},
		});
		try {
			assert.equal((await fetch(`${server.origin}/health`)).status, 200);
			await client.reconnection.connect();
			const greeter = client.connector.peer.resolve(REMOTE_GREETING_SERVICE);
			assert.equal(await greeter.ready(), "Example test browser");
			assert.deepEqual(messages, ["Node called this browser."]);
			const calls = [
				greeter.greet("Ada", 200),
				greeter.greet("Grace", 200),
				greeter.greet("Linus", 200),
			];
			await eventually(
				async () => (await snapshot(server.origin)).pendingCalls.length === 3,
			);
			const pending = await snapshot(server.origin);
			assert.deepEqual(pending.peerStatuses, [RpcStateStatusEnum.connected]);
			assert.equal(pending.listenerStatus, RpcStateStatusEnum.listening);
			assert.ok(
				pending.pendingCalls.every(
					(call) => call.direction === RpcCallDirectionEnum.incoming,
				),
			);
			assert.equal(JSON.stringify(pending).includes("Ada"), false);
			assert.deepEqual(await Promise.all(calls), [
				"Hello, Ada!",
				"Hello, Grace!",
				"Hello, Linus!",
			]);
			for (const [name, delay] of [
				["", 0],
				["Ada", -1],
				["Ada", 10_001],
				["Ada", 0.5],
			] as const) {
				await assert.rejects(
					greeter.greet(name, delay),
					(error: unknown) =>
						error instanceof RpcException &&
						error.code === RpcExceptionCodeEnum.handlerFailed,
				);
			}
			const retained = greeter.greet("Drain", 100);
			await eventually(
				async () => (await snapshot(server.origin)).pendingCalls.length === 1,
			);
			const shutdown = server.shutdown();
			assert.equal(shutdown, server.shutdown());
			assert.equal(await retained, "Hello, Drain!");
			await shutdown;
			await assert.rejects(fetch(`${server.origin}/health`));
		} finally {
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});
});

async function snapshot(origin: string): Promise<NodeDiagnosticsSnapshot> {
	return (await fetch(`${origin}/api/snapshot`)).json();
}

async function eventually(
	check: () => boolean | Promise<boolean>,
): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!(await check())) {
		assert.ok(
			Date.now() < deadline,
			"Condition did not become true within 3 seconds.",
		);
		await setTimeout(5);
	}
}
