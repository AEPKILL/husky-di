/**
 * @overview Connector Adapter source, startup, handoff and ownership conformance cases.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcConnectorAdapterConformanceFixture } from "@/conformance/rpc-conformance.interface";
import {
	assertRpcConformance,
	type IRpcConformanceCase,
	within,
} from "@/conformance/rpc-conformance.util";
import {
	createCaseFactory,
	createConnectionCases,
	isAbortError,
	rejectionOf,
} from "@/conformance/rpc-connection-conformance.util";
import type {
	ConnectorFixture,
	OpenedConnection,
} from "@/conformance/types/rpc-adapter-case.type";
import type { IRpcConnection } from "@/modules/transport";

/** Creates the stable Connector Adapter conformance cases documented by `/conformance`. */
export function createConnectorAdapterConformanceCases(
	fixture: IRpcConnectorAdapterConformanceFixture,
): IRpcConformanceCase[] {
	const wrap = createCaseFactory(fixture, "Connector");
	return [
		wrap(
			"RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.handoff.subscribe-before-start",
			testConnectorHandoff,
		),
		wrap(
			"RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.source.multicast-terminal-single-use",
			testConnectorSource,
		),
		...createConnectionCases("connector", wrap, openConnector),
		wrap(
			"RPC-TRANSPORT-008 connector.start.abort-before-handoff",
			testConnectorAbort,
		),
		wrap(
			"RPC-TRANSPORT-003 RPC-TRANSPORT-008 connector.start.failure-error-identity",
			testConnectorFailure,
		),
		wrap(
			"RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.start.abort-after-handoff-no-revocation",
			testConnectorAbortAfterHandoff,
		),
	];
}

async function testConnectorHandoff(created: ConnectorFixture): Promise<void> {
	const firstMessage = new Uint8Array([1, 3, 5]);
	let connectionCount = 0;
	let sourceCompleted = false;
	let insideHandoff = false;
	let firstObservedInsideHandoff = false;
	let observedFirst: Uint8Array | undefined;
	created.adapter.connection$.subscribe({
		next(connection) {
			insideHandoff = true;
			connectionCount += 1;
			connection.message$.subscribe((message) => {
				firstObservedInsideHandoff = insideHandoff;
				observedFirst = message;
			});
			insideHandoff = false;
		},
		complete: () => (sourceCompleted = true),
	});
	const startup = created.adapter.connect(new AbortController().signal);
	const remote = await within(
		created.handoff(firstMessage),
		"Connector handoff",
	);
	await within(startup, "Connector startup");
	assertRpcConformance(
		connectionCount === 1,
		"Expected exactly one Connection.",
	);
	assertRpcConformance(
		sourceCompleted,
		"Source did not complete before startup.",
	);
	assertRpcConformance(
		observedFirst?.[0] === firstMessage[0] &&
			observedFirst?.[1] === firstMessage[1] &&
			observedFirst?.[2] === firstMessage[2],
		"First message content changed.",
	);
	assertRpcConformance(
		!firstObservedInsideHandoff,
		"First message was emitted before the ownership barrier.",
	);
	await remote.closeFromRemote();
}

async function testConnectorSource(created: ConnectorFixture): Promise<void> {
	const left: IRpcConnection[] = [];
	const right: IRpcConnection[] = [];
	let completed = 0;
	created.adapter.connection$.subscribe({
		next: (connection) => left.push(connection),
		complete: () => (completed += 1),
	});
	created.adapter.connection$.subscribe({
		next: (connection) => right.push(connection),
		complete: () => (completed += 1),
	});
	const controller = new AbortController();
	const startup = created.adapter.connect(controller.signal);
	const remote = await created.handoff();
	await startup;
	assertRpcConformance(
		left.length === 1 && right.length === 1 && left[0] === right[0],
		"Connection handoff was not one multicast identity.",
	);
	assertRpcConformance(completed === 2, "Source terminal was not multicast.");
	let lateCompleted = false;
	let lateValues = 0;
	created.adapter.connection$.subscribe({
		next: () => (lateValues += 1),
		complete: () => (lateCompleted = true),
	});
	assertRpcConformance(
		lateCompleted && lateValues === 0,
		"Late observer missed source terminal or received a replayed Connection.",
	);
	assertRpcConformance(
		(await rejectionOf(created.adapter.connect(controller.signal))) instanceof
			Error,
		"Single-use Adapter restarted.",
	);
	assertRpcConformance(
		!remote.isAdapterClosed(),
		"Source terminal revoked ownership.",
	);
	await remote.closeFromRemote();
}

async function testConnectorAbort(created: ConnectorFixture): Promise<void> {
	let values = 0;
	let completed = false;
	created.adapter.connection$.subscribe({
		next: () => (values += 1),
		complete: () => (completed = true),
	});
	const controller = new AbortController();
	const startup = created.adapter.connect(controller.signal);
	controller.abort();
	assertRpcConformance(
		isAbortError(await within(rejectionOf(startup), "Connector abort")),
		"Pre-handoff abort did not reject AbortError.",
	);
	assertRpcConformance(
		values === 0 && completed,
		"Abort did not complete empty source.",
	);
}

async function testConnectorFailure(created: ConnectorFixture): Promise<void> {
	const startupError = new Error("startup failed");
	let sourceError: unknown;
	created.adapter.connection$.subscribe({
		error: (error) => (sourceError = error),
	});
	const startup = created.adapter.connect(new AbortController().signal);
	await created.failStartup(startupError);
	assertRpcConformance(
		(await within(rejectionOf(startup), "Connector startup failure")) ===
			startupError && sourceError === startupError,
		"Startup Error identity changed.",
	);
}

async function testConnectorAbortAfterHandoff(
	created: ConnectorFixture,
): Promise<void> {
	let connection: IRpcConnection | undefined;
	created.adapter.connection$.subscribe((value) => (connection = value));
	const controller = new AbortController();
	const startup = created.adapter.connect(controller.signal);
	const remote = await created.handoff();
	await startup;
	controller.abort();
	assertRpcConformance(
		connection !== undefined,
		"Connection was not handed off.",
	);
	await connection.send(new Uint8Array([8]));
	assertRpcConformance(
		(await remote.receiveFromAdapter())[0] === 8,
		"Later abort revoked transferred Connection.",
	);
	await remote.closeFromRemote();
}

async function openConnector(
	created: ConnectorFixture,
): Promise<OpenedConnection> {
	let connection: IRpcConnection | undefined;
	created.adapter.connection$.subscribe((value) => (connection = value));
	const startup = created.adapter.connect(new AbortController().signal);
	const remote = await within(created.handoff(), "Connector handoff");
	await within(startup, "Connector startup");
	assertRpcConformance(
		connection !== undefined,
		"Connector did not hand off a Connection.",
	);
	return { connection, remote, finish: async () => undefined };
}
