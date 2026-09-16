/**
 * @overview Executable evidence for browser/Node RPC example requirements over real WebSockets.
 * @author AEPKILL
 * @created 2026-08-21 01:06:59
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	createRpcConnector,
	type IRpcConnection,
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
import { NEVER, Subject } from "rxjs";
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
import { MessagePanel } from "@/web/components/devtools/message-panel";
import { NetworkPanel } from "@/web/components/devtools/network-panel";
import { WorkbenchHeader } from "@/web/components/workbench-header";
import {
	DevtoolsDetailEnum,
	DevtoolsPanelEnum,
	DevtoolsTimeSortEnum,
} from "@/web/enums/devtools.enum";
import { EditorTab } from "@/web/platform/editor-tab";
import { PlatformWorkbench } from "@/web/platform/platform-workbench";
import type { DevtoolsView } from "@/web/types/devtools.type";
import { formatDevtoolsJson } from "@/web/utils/format-devtools-json.util";
import { getPeerStatusLabel } from "@/web/utils/get-peer-status-label.util";
import { selectNetworkRecords } from "@/web/utils/select-network-records.util";
import "./lab/lab-scenarios.test";
import "./recording/recording.test";
import "./lab/owner-information.test";
import "./lab/custom-services.test";
import "./lab/e2e-runs.test";
import "./lab/stream-scenario.test";
import "./platform/project.test";
import "./platform/service.test";
import "./platform/control.test";
import "./platform/execution.test";
import "./platform/material-icons.test";

describe("Remote Lab specification", () => {
	it("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 titlebar exposes centered project access and named native controls", () => {
		const html = renderToStaticMarkup(createElement(PlatformWorkbench));
		const header = html.slice(
			html.indexOf("<header"),
			html.indexOf("</header>"),
		);
		assert.match(
			header,
			/class="platform-header titlebar-container has-center"/,
		);
		for (const region of ["titlebar-left", "titlebar-center", "titlebar-right"])
			assert.match(header, new RegExp(`class="${region}"`));
		for (const name of ["Previous open source", "Next open source"])
			assert.match(
				header,
				new RegExp(
					`<button(?=[^>]*aria-label="${name}")(?=[^>]*disabled="")[^>]*>`,
				),
			);
		assert.match(header, /aria-label="Open project explorer"/);
		assert.match(header, /aria-label="0 project files"/);
		assert.match(header, /<select[^>]*aria-label="Workbench theme"/);
		assert.match(
			header,
			/<button(?=[^>]*aria-label="Toggle project sidebar")(?=[^>]*aria-expanded="true")[^>]*>/,
		);
		assert.match(
			header,
			/class="titlebar-icon icon-layout" aria-hidden="true"/,
		);
		assert.doesNotMatch(header, /platform-brand/);
	});

	it("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 editor tabs retain named controls with Monaco icon-label containers", async () => {
		for (const active of [false, true]) {
			const html = renderToStaticMarkup(
				createElement(EditorTab, {
					path: "src/<draft>.case.ts",
					active,
					onActivate: () => {},
					onClose: () => {},
				}),
			);
			assert.match(html, /class="monaco-icon-label file-icon tab-label"/);
			assert.match(
				html,
				/class="monaco-icon-label-container"><span class="monaco-icon-name-container"><span class="label-name">&lt;draft&gt;\.case\.ts/,
			);
			assert.match(
				html,
				new RegExp(`role="tab"[^>]*aria-selected="${active}"`),
			);
			assert.match(html, /aria-label="Close src\/&lt;draft&gt;\.case\.ts"/);
			assert.match(html, /class="codicon-close-small" aria-hidden="true"/);
			assert.doesNotMatch(html, /<img|×/);
			assert.match(html, /file_type_testts\.svg/);
		}
		await readFile(
			new URL(
				"../src/web/platform/icons/vscode/LICENSE-vscode-icons.txt",
				import.meta.url,
			),
		);
		await readFile(
			new URL(
				"../src/web/platform/icons/vscode/LICENSE-codicons.txt",
				import.meta.url,
			),
		);
	});

	it("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 initially exposes Explorer, collapsed panel controls and system theme", () => {
		const workbench = renderToStaticMarkup(createElement(PlatformWorkbench));
		for (const activity of ["Explorer", "Testing", "History"]) {
			assert.match(
				workbench,
				new RegExp(
					`<button(?=[^>]*aria-label="${activity}")(?=[^>]*aria-pressed="${activity === "Explorer"}")[^>]*>`,
				),
			);
		}
		for (const panel of ["Toggle run inspector", "Toggle observation panel"]) {
			assert.match(
				workbench,
				new RegExp(
					`<button(?=[^>]*aria-label="${panel}")(?=[^>]*aria-expanded="false")[^>]*>`,
				),
			);
		}
		assert.match(workbench, /<select[^>]*aria-label="Workbench theme"/);
		assert.match(
			workbench,
			/<option(?=[^>]*value="system")(?=[^>]*selected="")[^>]*>/,
		);
		assert.match(workbench, /<option[^>]*value="light"/);
		assert.match(workbench, /<option[^>]*value="dark"/);
		assert.match(workbench, /data-testid="workbench-run-status"/);
		const separators = workbench.match(/<hr\b[^>]*>/g) ?? [];
		assert.equal(
			(workbench.match(/class="split-view-container"/g) ?? []).length,
			3,
		);
		assert.equal((workbench.match(/class="split-view"/g) ?? []).length, 6);
		assert.doesNotMatch(workbench, /data-slot="resizable-/);
		assert.equal(separators.length, 3);
		for (const name of ["Resize execution panel", "Resize data flow panel"]) {
			const separator = separators.find((tag) =>
				tag.includes(`aria-label="${name}"`),
			);
			assert.ok(separator);
			assert.match(separator, /aria-disabled="true"/);
			assert.doesNotMatch(separator, /tabindex="0"/);
		}
		assert.doesNotMatch(separators[0] ?? "", /aria-disabled="true"/);
	});

	it("EXAMPLE-LAB-PLATFORM-WORKBENCH-001 keeps the Atom Material dark palette and pane frame contract", async () => {
		const css = await readFile(
			new URL("../src/web/platform/platform.css", import.meta.url),
			"utf8",
		);
		const editor = await readFile(
			new URL("../src/web/platform/project-editor.tsx", import.meta.url),
			"utf8",
		);
		for (const token of ["#263238", "#232e33", "#009688", "#23292d"]) {
			assert.match(css, new RegExp(token.replace("#", "\\#")));
		}
		for (const frameRule of [
			"border: 1px solid #333d42;",
			"border-radius: 8px;",
			"border-radius: 8px 0 0 8px;",
			"border-radius: 0 8px 8px 0;",
			"border-left-color: transparent;",
			"padding: 0 4px 4px;",
		]) {
			assert.ok(
				css.includes(frameRule),
				`Missing reference pane frame: ${frameRule}`,
			);
		}
		for (const token of ["C792EA", "C3E88D", "F78C6A", "82AAFF"]) {
			assert.match(editor, new RegExp(token));
		}
	});

	it("EXAMPLE-LAB-RECORD-001 carries correlation traces as Call Metadata", async () => {
		const server = await createExampleServer({ port: 0 });
		const client = createExampleClient({
			adapterFactory: () =>
				createWebSocketConnectorAdapter({
					url: `${server.origin.replace("http:", "ws:")}/rpc`,
				}),
			display: { showMessage: () => "Metadata browser" },
		});
		try {
			await client.reconnection.connect();
			const lab = client.connector.peer.resolve(REMOTE_LAB_SERVICE);
			await client.traceContext.run("metadata-trace", () => lab.echo("value"));
			const snapshot: LabServerSnapshot = await (
				await fetch(`${server.origin}/api/lab`)
			).json();
			const payloads = snapshot.recording.entries
				.map((entry) => entry.transportMessage?.payload)
				.filter((payload): payload is string => payload !== undefined);
			assert.ok(payloads.some((payload) => payload.includes('"metadata"')));
			assert.ok(payloads.some((payload) => payload.includes("metadata-trace")));
			assert.ok(
				snapshot.recording.calls.some(
					(call) =>
						call.traceId === "metadata-trace" && call.arguments === '["value"]',
				),
			);
		} finally {
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-LAB-MESSAGES-001 sorts Browser messages by observation time and keeps Node inspection separate", () => {
		const message = {
			connectionId: "Browser-connection-1",
			sessionId: "current-session",
			type: "message",
			direction: LabTransportDirectionEnum.sent,
			bytes: 123,
			outcome: "fulfilled",
			payload:
				'{"kind":"message","seq":1,"message":{"kind":"call","callId":"1","service":"example.lab.v1","method":"echo","args":["browser-secret"]}}',
		};
		const entry = {
			at: Date.parse("2026-09-11T01:02:03.007Z"),
			source: LabSourceEnum.transport,
			summary: "message",
			side: LabSideEnum.browser,
		};
		const entries: (LabLogEntry & { side: LabSideEnum })[] = [
			{
				...entry,
				id: "lifecycle",
				source: LabSourceEnum.rpc,
				handshake: {
					type: RpcEventTypeEnum.peerRecovered,
					peerId: "current-peer",
					outcome: "fulfilled",
				},
			},
			{
				...entry,
				id: "node",
				side: LabSideEnum.node,
				transportMessage: {
					...message,
					connectionId: "Node-connection-1",
					direction: LabTransportDirectionEnum.received,
					payload: '{"kind":"ack","ackThrough":2,"extension":"node-secret"}',
					type: "ack",
				},
			},
			{
				...entry,
				id: "result",
				at: entry.at + 1,
				transportMessage: {
					...message,
					direction: LabTransportDirectionEnum.received,
					payload:
						'{"kind":"message","seq":2,"message":{"kind":"result","callId":"1","value":"browser-secret"}}',
				},
			},
			{
				...entry,
				id: "ack",
				transportMessage: {
					...message,
					type: "ack",
					payload: '{"kind":"ack","ackThrough":1}',
				},
			},
			{ ...entry, id: "call", transportMessage: message },
		];
		const originalEntries = structuredClone(entries);
		const view: DevtoolsView = {
			panel: DevtoolsPanelEnum.network,
			detail: DevtoolsDetailEnum.payload,
			selected: "Browser:result",
			filter: "",
			side: "all",
			status: "all",
			payload: true,
		};
		const markup = renderToStaticMarkup(
			createElement(NetworkPanel, {
				calls: [],
				entries,
				selected: undefined,
				view,
				vertical: false,
				onViewChange() {},
			}),
		);
		const rows = [
			...markup.matchAll(
				/<tr\b[^>]*data-message="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g,
			),
		];
		assert.deepEqual(
			rows.map((row) => row[1]),
			["call", "ack", "result"],
		);
		assert.ok(rows.every((row) => row[0].includes('data-side="Browser"')));
		assert.ok(rows[0][0].includes('data-direction="sent"'));
		assert.ok(rows[2][0].includes('data-direction="received"'));
		assert.match(rows[0][0], /\d{2}:\d{2}:\d{2}\.007<\/time>/);
		assert.match(rows[2][0], /\d{2}:\d{2}:\d{2}\.008<\/time>/);
		assert.ok(rows[0][0].includes("123 B"));
		assert.match(markup, /<th\b[^>]*aria-sort="ascending"[^>]*>/);
		assert.ok(rows[2][0].includes('class="selected"'));
		assert.match(markup, /aria-pressed="true"[^>]*>Messages<\/button>/);
		assert.ok(markup.includes('aria-label="Filter by direction"'));
		assert.ok(markup.includes("↑ Sent"));
		assert.ok(markup.includes("↓ Received"));
		assert.ok(markup.includes("Raw JSON"));
		assert.ok(markup.includes("browser-secret"));
		assert.ok(markup.includes('data-owner="connector"'));
		assert.doesNotMatch(markup, /peer-recovered|node-secret|Node-connection-1/);
		const descendingMarkup = renderToStaticMarkup(
			createElement(MessagePanel, {
				entries,
				view: { ...view, networkTimeSort: DevtoolsTimeSortEnum.descending },
				vertical: false,
				onViewChange() {},
			}),
		);
		const descendingRows = [
			...descendingMarkup.matchAll(
				/<tr\b[^>]*data-message="([^"]+)"[^>]*>[\s\S]*?<\/tr>/g,
			),
		];
		assert.deepEqual(
			descendingRows.map((row) => row[1]),
			["result", "call", "ack"],
		);
		assert.match(descendingMarkup, /<th\b[^>]*aria-sort="descending"[^>]*>/);
		assert.ok(descendingRows[0][0].includes('class="selected"'));
		const receivedMarkup = renderToStaticMarkup(
			createElement(MessagePanel, {
				entries,
				view: { ...view, networkDirection: LabTransportDirectionEnum.received },
				vertical: false,
				onViewChange() {},
			}),
		);
		assert.deepEqual(
			[...receivedMarkup.matchAll(/<tr\b[^>]*data-message="([^"]+)"/g)].map(
				(row) => row[1],
			),
			["result"],
		);
		assert.match(
			receivedMarkup,
			/<option value="received" selected="">Received/,
		);
		const nodeMarkup = renderToStaticMarkup(
			createElement(MessagePanel, {
				entries,
				view: { ...view, side: LabSideEnum.node },
				vertical: false,
				onViewChange() {},
			}),
		);
		assert.equal(
			[...nodeMarkup.matchAll(/<tr\b[^>]*data-message=/g)].length,
			1,
		);
		assert.ok(nodeMarkup.includes('data-side="Node"'));
		assert.ok(nodeMarkup.includes('data-owner="acceptor"'));
		assert.ok(nodeMarkup.includes("node-secret"));
		assert.doesNotMatch(nodeMarkup, /browser-secret|Browser-connection-1/);
		const hiddenMarkup = renderToStaticMarkup(
			createElement(MessagePanel, {
				entries,
				view: { ...view, payload: false },
				vertical: false,
				onViewChange() {},
			}),
		);
		assert.ok(hiddenMarkup.includes("Message payload hidden"));
		assert.doesNotMatch(hiddenMarkup, /browser-secret|node-secret|Raw JSON/);
		assert.deepEqual(entries, originalEntries);
	});

	it("EXAMPLE-LAB-MESSAGES-001 records actual message envelopes and control traffic once per observed send or receive", async () => {
		const recorder = createLabRecorder(LabSideEnum.browser);
		const connections = new Subject<IRpcConnection>();
		const messages = new Subject<Uint8Array>();
		let rejectSend = false;
		const failure = new Error("private Transport failure");
		const adapter = createObservedConnectorAdapter(
			{
				connection$: connections,
				async connect() {},
			},
			recorder,
		);
		let observed: IRpcConnection | undefined;
		adapter.connection$.subscribe((connection) => {
			observed = connection;
		});
		connections.next({
			message$: messages,
			async send() {
				if (rejectSend) throw failure;
			},
			async close() {},
		});
		assert.ok(observed);
		const first = observed.message$.subscribe();
		const second = observed.message$.subscribe();
		const sessionId = "A".repeat(43);
		const payloads = [
			'{"kind":"fresh","profiles":["husky-di-rpc/1"]}',
			JSON.stringify({
				kind: "accept",
				profile: "husky-di-rpc/1",
				sessionId,
				bindingEpoch: 1,
				resumeToken: `${"B".repeat(42)}A`,
			}),
			'{"kind":"message","seq":1,"message":{"kind":"call","callId":"1","service":"example.lab.v1","method":"echo","args":["hello"]}}',
			'{"kind":"message","seq":2,"message":{"kind":"result","callId":"1","value":{"message":"hello"}}}',
			'{"kind":"ack","ackThrough":2}',
			'{"kind":"message","seq":3,"message":{"kind":"cancel","callId":"2"}}',
		];
		try {
			for (const payload of payloads) {
				const bytes = new TextEncoder().encode(payload);
				await observed.send(bytes);
				messages.next(bytes);
				bytes.fill(0);
			}
			const snapshot = recorder.snapshot();
			assert.equal(snapshot.entries.length, payloads.length * 2);
			const entries = [...snapshot.entries].reverse();
			assert.deepEqual(
				entries.map((entry) => entry.transportMessage?.payload),
				payloads.flatMap((payload) => [payload, payload]),
			);
			assert.deepEqual(
				entries.map((entry) => entry.transportMessage?.direction),
				payloads.flatMap(() => [
					LabTransportDirectionEnum.sent,
					LabTransportDirectionEnum.received,
				]),
			);
			for (const [index, entry] of entries.entries()) {
				const frame = entry.transportMessage;
				assert.ok(frame);
				const payload = payloads[Math.floor(index / 2)];
				assert.equal(frame.type, JSON.parse(payload).kind);
				assert.equal(frame.bytes, new TextEncoder().encode(payload).byteLength);
				assert.equal(frame.sessionId, sessionId);
				assert.equal(frame.outcome, "fulfilled");
				assert.equal(entry.source, LabSourceEnum.transport);
				assert.ok(entry.at > 0);
			}
			assert.equal(
				new Set(entries.map((entry) => entry.transportMessage?.connectionId))
					.size,
				1,
			);
			Object.assign(entries[0].transportMessage ?? {}, { payload: "changed" });
			assert.equal(
				recorder.snapshot().entries.at(-1)?.transportMessage?.payload,
				payloads[0],
			);
			rejectSend = true;
			await assert.rejects(
				observed.send(new TextEncoder().encode(payloads[2])),
				(error) => error === failure,
			);
			assert.equal(
				recorder.snapshot().entries[0].transportMessage?.outcome,
				"failed",
			);
			assert.equal(
				recorder.snapshot().entries[0].transportMessage?.direction,
				LabTransportDirectionEnum.sent,
			);
			assert.equal(
				JSON.stringify(recorder.snapshot()).includes(failure.message),
				false,
			);
			const count = recorder
				.snapshot()
				.entries.filter((entry) => entry.transportMessage).length;
			recorder.recordEvent({ type: RpcEventTypeEnum.ownerDraining });
			await assert.rejects(
				recorder.run(
					{
						traceId: "local-preflight",
						peerId: "current-peer",
						side: LabSideEnum.browser,
						direction: RpcCallDirectionEnum.outgoing,
						service: "example.lab.v1",
						method: "echo",
					},
					[],
					() => {
						throw new TypeError("local preflight");
					},
				),
				TypeError,
			);
			assert.equal(
				recorder.snapshot().entries.filter((entry) => entry.transportMessage)
					.length,
				count,
			);
		} finally {
			messages.complete();
			connections.complete();
			first.unsubscribe();
			second.unsubscribe();
		}
	});

	it("EXAMPLE-LAB-MESSAGES-001 scopes Transport-only records to the current Session", () => {
		const message = {
			type: "ack",
			connectionId: "Node-connection-1",
			sessionId: "current-session",
			direction: LabTransportDirectionEnum.received,
			bytes: 31,
			outcome: "fulfilled",
			payload: '{"kind":"ack","ackThrough":2}',
		};
		const entry = {
			at: 1,
			source: LabSourceEnum.transport,
			summary: "message",
			side: LabSideEnum.node,
		};
		const entries: (LabLogEntry & { side: LabSideEnum })[] = [
			{ ...entry, id: "current", transportMessage: message },
			{
				...entry,
				id: "other",
				transportMessage: { ...message, sessionId: "other-session" },
			},
			{
				...entry,
				id: "unknown",
				transportMessage: { ...message, sessionId: undefined },
			},
			{
				...entry,
				id: "browser",
				side: LabSideEnum.browser,
				transportMessage: { ...message, sessionId: undefined },
			},
		];
		assert.deepEqual(
			selectNetworkRecords({
				peerId: "current-peer",
				sessionId: "current-session",
				calls: [],
				entries,
			}).entries.map((record) => record.id),
			["current", "browser"],
		);
		assert.deepEqual(
			selectNetworkRecords({
				peerId: undefined,
				sessionId: undefined,
				calls: [],
				entries,
			}).entries.map((record) => record.id),
			["browser"],
		);
	});

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
					clients[index].traceContext.run(`completed-${index}`, () =>
						control.echo(index),
					),
				),
			);
			const report = clients[0].traceContext.run("retained-report", () =>
				controls[0].report(true, 0, new AbortController().signal),
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
				observedAt: cleared.diagnostics.observedAt,
				totalEvents: 0,
				recentEvents: [],
				pendingCalls: pending,
			});
			assert.equal((await snapshot(server.origin)).totalEvents, 0);
			assert.equal(
				await clients[0].traceContext.run("resume-retained", () =>
					controls[0].resume("retained-report"),
				),
				true,
			);
			assert.equal((await report).handlerEntries, 1);
			assert.equal(
				await clients[1].traceContext.run("after-clear", () =>
					controls[1].echo("still connected"),
				),
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

	it("EXAMPLE-LAB-E2E-003 includes managed E2E observations in the manual Network", () => {
		const currentCall: LabCallRecord = {
			id: "current-call",
			side: LabSideEnum.browser,
			peerId: "peer-1",
			direction: RpcCallDirectionEnum.outgoing,
			traceId: "manual-trace",
			service: "shipping",
			method: "quote",
			startedAt: 1,
			outcome: "fulfilled",
			arguments: "[]",
			phases: [],
		};
		const managedCall: LabCallRecord = {
			...currentCall,
			id: "managed-call",
			peerId: "peer-1",
			traceId: "e2e:run:case:quote",
			side: LabSideEnum.node,
			direction: RpcCallDirectionEnum.incoming,
		};
		const selected = selectNetworkRecords({
			peerId: "peer-1",
			sessionId: "current-session",
			calls: [currentCall, managedCall],
			entries: [
				{
					id: "manual-entry",
					at: 1,
					source: LabSourceEnum.application,
					summary: "manual-trace · shipping.quote",
					side: LabSideEnum.browser,
				},
				{
					id: "current-peer-entry",
					at: 2,
					source: LabSourceEnum.application,
					summary: "peer-1 · manual-trace · shipping.quote",
					side: LabSideEnum.node,
				},
				{
					id: "managed-entry",
					at: 3,
					source: LabSourceEnum.transport,
					summary: "Node · E2E transport",
					side: LabSideEnum.node,
					managedE2e: true,
					transportMessage: {
						type: "message",
						connectionId: "Node-connection-e2e",
						sessionId: "e2e-session",
						direction: LabTransportDirectionEnum.received,
						bytes: 10,
						outcome: "fulfilled",
					},
				},
			],
		});
		assert.deepEqual(
			selected.calls.map((call) => call.id),
			["current-call", "managed-call"],
		);
		assert.deepEqual(
			selected.entries.map((entry) => entry.id),
			["manual-entry", "current-peer-entry", "managed-entry"],
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
			const cleared = diagnostics.snapshot();
			assert.deepEqual(cleared, {
				observedAt: cleared.observedAt,
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
				assert.deepEqual(fresh.payload.profiles, [
					"husky-di-rpc/2",
					"husky-di-rpc/1",
				]);
				for (const { payload } of [freshAccept, resume, resumeAccept]) {
					assert.equal(payload.profile, "husky-di-rpc/2");
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
	}, async (context) => {
		const child = spawn(
			process.execPath,
			["--import", "tsx", "src/server/dev.ts"],
			{
				cwd: fileURLToPath(new URL("..", import.meta.url)),
				env: { ...process.env, LAB_RPC_PORT: "0", LAB_WEB_PORT: "0" },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let output = "";
		let origin = "";
		const ready = new Promise<string>((resolve) => {
			child.stdout.on("data", (chunk: Buffer) => {
				output += chunk.toString();
				const address = output.match(
					/Web UI: (http:\/\/127\.0\.0\.1:\d+)/,
				)?.[1];
				if (address) resolve(address);
			});
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
				createWebSocketConnectorAdapter({
					url: `${origin.replace("http:", "ws:")}/rpc`,
				}),
			display: { showMessage: () => "Signal test browser" },
		});
		const abort = () => {
			if (child.exitCode === null && child.signalCode === null)
				child.kill("SIGKILL");
		};
		context.signal.addEventListener("abort", abort, { once: true });
		try {
			origin = await Promise.race([
				ready,
				exited.then((result) => {
					throw new Error(
						`Dev process exited before readiness: ${JSON.stringify(result)}\n${output}`,
					);
				}),
			]);
			assert.equal((await fetch(`${origin}/`)).status, 200);
			await client.reconnection.connect();
			const greeter = client.connector.peer.resolve(REMOTE_GREETING_SERVICE);
			assert.equal(await greeter.ready(), "Signal test browser");
			const pending = greeter.greet("Signal drain", 500);
			// Observe the server's admitted handler, then deliver SIGTERM to the actual owner process.
			await eventually(async () =>
				(await snapshot(origin)).pendingCalls.some(
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
			await assert.rejects(fetch(`${origin}/health`));
			await assert.rejects(fetch(`${origin}/`));
		} finally {
			context.signal.removeEventListener("abort", abort);
			abort();
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
				greeter.greet("Ada-payload-only-7c", 200),
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
			assert.equal(
				JSON.stringify(pending).includes("Ada-payload-only-7c"),
				false,
			);
			assert.deepEqual(await Promise.all(calls), [
				"Hello, Ada-payload-only-7c!",
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
