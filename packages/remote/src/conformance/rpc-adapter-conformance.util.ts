/**
 * @overview Black-box conformance cases for public RPC Transport Adapters.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	IRpcAcceptorAdapterConformanceFixture,
	IRpcAdapterConformanceRemote,
	IRpcConnectorAdapterConformanceFixture,
} from "@/conformance/rpc-conformance.interface";
import type { RpcConformanceOptions } from "@/conformance/rpc-conformance.type";
import {
	assertRpcConformance,
	type IRpcConformanceCase,
	runRpcConformanceCases,
	waitFor,
	within,
} from "@/conformance/rpc-conformance.util";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

const COMPATIBILITY_MESSAGE_BYTES = 1_048_576;

type ConnectorFixture = Awaited<
	ReturnType<IRpcConnectorAdapterConformanceFixture["create"]>
>;
type AcceptorFixture = Awaited<
	ReturnType<IRpcAcceptorAdapterConformanceFixture["create"]>
>;
type OpenedConnection = {
	readonly connection: IRpcConnection;
	readonly remote: IRpcAdapterConformanceRemote;
	finish(): Promise<void>;
};

/** Runs the stable Connector Adapter conformance cases documented by `/conformance`. */
export function runRpcConnectorAdapterConformance(
	fixture: IRpcConnectorAdapterConformanceFixture,
	options?: RpcConformanceOptions,
): Promise<void> {
	const wrap = createCaseFactory(fixture, "Connector");
	return runRpcConformanceCases(
		[
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
		],
		options,
	);
}

/** Runs the stable Acceptor Adapter conformance cases documented by `/conformance`. */
export function runRpcAcceptorAdapterConformance(
	fixture: IRpcAcceptorAdapterConformanceFixture,
	options?: RpcConformanceOptions,
): Promise<void> {
	const wrap = createCaseFactory(fixture, "Acceptor");
	return runRpcConformanceCases(
		[
			wrap(
				"RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.handoff.subscribe-before-start-early-accept",
				testAcceptorHandoff,
			),
			wrap(
				"RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.source.multicast-order-hot-terminal",
				testAcceptorSource,
			),
			...createConnectionCases("acceptor", wrap, openAcceptor),
			wrap(
				"RPC-TRANSPORT-009 acceptor.start.abort-before-ready",
				testAcceptorAbortBeforeReady,
			),
			wrap(
				"RPC-TRANSPORT-009 acceptor.start.abort-after-ready",
				testAcceptorAbortAfterReady,
			),
			wrap(
				"RPC-TRANSPORT-009 acceptor.start.complete-before-ready",
				testAcceptorCompleteBeforeReady,
			),
			wrap(
				"RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.start.failure-error-identity",
				testAcceptorFailure,
			),
			wrap(
				"RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.listener.failure-after-ready-no-revocation",
				testAcceptorFailureAfterReady,
			),
			wrap(
				"RPC-TRANSPORT-010 acceptor.connection.failure-isolation",
				testAcceptorIsolation,
			),
			wrap(
				"RPC-TRANSPORT-007 RPC-TRANSPORT-009 RPC-TRANSPORT-011 acceptor.overflow.abort-inside-handoff",
				testAcceptorOverflow,
			),
		],
		options,
	);
}

function createConnectionCases<T>(
	role: "connector" | "acceptor",
	wrap: (
		caseId: string,
		run: (created: T) => Promise<void>,
	) => IRpcConformanceCase,
	open: (created: T) => Promise<OpenedConnection>,
): IRpcConformanceCase[] {
	return [
		wrap(
			`RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 ${role}.message.identity-order-hot-terminal`,
			async (created) => {
				const opened = await open(created);
				await opened.remote.sendToAdapter(new Uint8Array([1]));
				const first = new Uint8Array([2]);
				const second = new Uint8Array([4]);
				const left: Uint8Array[] = [];
				const right: Uint8Array[] = [];
				const late: Uint8Array[] = [];
				let completed = 0;
				opened.connection.message$.subscribe({
					next: (message) => left.push(message),
					complete: () => (completed += 1),
				});
				opened.connection.message$.subscribe({
					next: (message) => right.push(message),
					complete: () => (completed += 1),
				});
				await opened.remote.sendToAdapter(first);
				opened.connection.message$.subscribe((message) => late.push(message));
				await opened.remote.sendToAdapter(second);
				assertRpcConformance(
					left[0] === right[0] && left[0]?.[0] === first[0],
					"Observers received different first-message identity or content.",
				);
				assertRpcConformance(
					left[1] === right[1] &&
						late.length === 1 &&
						late[0] === left[1] &&
						left[1]?.[0] === second[0] &&
						left[0]?.[0] === first[0] &&
						left[0]?.byteLength === first.byteLength,
					"Message order, identity, or stable storage changed.",
				);
				await opened.remote.closeFromRemote();
				const terminalValueCount = left.length;
				await opened.remote
					.sendToAdapter(new Uint8Array([6]))
					.catch(() => undefined);
				assertRpcConformance(
					completed === 2 && left.length === terminalValueCount,
					"Normal terminal was not multicast or admitted a later value.",
				);
				let lateCompleted = false;
				opened.connection.message$.subscribe({
					complete: () => (lateCompleted = true),
				});
				assertRpcConformance(
					lateCompleted,
					"Late observer missed normal terminal.",
				);
				await opened.finish();
			},
		),
		wrap(
			`RPC-TRANSPORT-001 RPC-TRANSPORT-003 ${role}.message.error-identity-terminal`,
			async (created) => {
				const opened = await open(created);
				const transportError = new Error("remote transport failed");
				let observed: unknown;
				let valueCount = 0;
				opened.connection.message$.subscribe({
					next: () => (valueCount += 1),
					error: (error) => (observed = error),
				});
				await opened.remote.setAdapterSendBlocked(true);
				const unsettledSend = rejectionOf(
					opened.connection.send(new Uint8Array([3])),
				);
				await opened.remote.failFromRemote(transportError);
				assertRpcConformance(
					observed === transportError,
					"Transport Error identity changed.",
				);
				assertRpcConformance(
					(await within(unsettledSend, "Failed Transport send")) ===
						transportError,
					"Unsettled send did not reject the Transport Error identity.",
				);
				let late: unknown;
				opened.connection.message$.subscribe({
					error: (error) => (late = error),
				});
				assertRpcConformance(
					late === transportError,
					"Late observer received a different Error.",
				);
				await opened.remote
					.sendToAdapter(new Uint8Array([7]))
					.catch(() => undefined);
				assertRpcConformance(
					valueCount === 0,
					"A message followed the terminal Transport Error.",
				);
				await opened.finish();
			},
		),
		wrap(
			`RPC-TRANSPORT-005 RPC-TRANSPORT-006 ${role}.send.local-admission-backpressure`,
			async (created) => {
				const opened = await open(created);
				const first = new Uint8Array([11, 12]);
				await opened.remote.setAdapterSendBlocked(true);
				const send = opened.connection.send(first);
				let settled = false;
				void send.then(
					() => (settled = true),
					() => (settled = true),
				);
				await turns(2);
				assertRpcConformance(!settled, "Backpressured send settled early.");
				await opened.remote.setAdapterSendBlocked(false);
				await within(send, "Backpressured send");
				first[0] = 99;
				const admitted = await within(
					opened.remote.receiveFromAdapter(),
					"Admitted message",
				);
				assertRpcConformance(
					admitted[0] === 11 && admitted[1] === 12,
					"Adapter borrowed bytes after fulfillment.",
				);
				await opened.connection.send(new Uint8Array([13]));
				assertRpcConformance(
					(await opened.remote.receiveFromAdapter())[0] === 13,
					"Ordered Local Admission failed.",
				);
				await opened.remote.closeFromRemote();
				await opened.finish();
			},
		),
		wrap(
			`RPC-TRANSPORT-006 ${role}.send.one-mebibyte-compatibility`,
			async (created) => {
				const opened = await open(created);
				const message = new Uint8Array(COMPATIBILITY_MESSAGE_BYTES);
				message[0] = 21;
				message[message.length - 1] = 34;
				await within(opened.connection.send(message), "1 MiB send");
				const received = await within(
					opened.remote.receiveFromAdapter(),
					"1 MiB receive",
				);
				assertRpcConformance(
					received.length === COMPATIBILITY_MESSAGE_BYTES &&
						received[0] === 21 &&
						received[received.length - 1] === 34,
					"1 MiB message changed.",
				);
				await opened.remote.closeFromRemote();
				await opened.finish();
			},
		),
		wrap(
			`RPC-TRANSPORT-003 RPC-TRANSPORT-007 ${role}.close.direct-idempotent-race`,
			async (created) => {
				const opened = await open(created);
				let completed = false;
				opened.connection.message$.subscribe({
					complete: () => (completed = true),
				});
				await opened.connection.send(new Uint8Array([54]));
				assertRpcConformance(
					(await opened.remote.receiveFromAdapter())[0] === 54,
					"Direct Close revoked an already fulfilled send.",
				);
				await opened.remote.setAdapterSendBlocked(true);
				const unsettled = rejectionOf(
					opened.connection.send(new Uint8Array([55])),
				);
				const firstClose = opened.connection.close();
				const secondClose = opened.connection.close();
				const laterSend = rejectionOf(
					opened.connection.send(new Uint8Array([56])),
				);
				assertRpcConformance(
					firstClose === secondClose,
					"Repeated Direct Close returned a different Promise.",
				);
				assertRpcConformance(
					(await within(laterSend, "Post-close send")) instanceof Error,
					"close() did not synchronously gate new send.",
				);
				assertRpcConformance(
					(await within(unsettled, "Unsettled send")) instanceof Error,
					"close() did not reject unsettled send.",
				);
				await within(Promise.all([firstClose, secondClose]), "Direct Close");
				await within(
					opened.remote.waitForAdapterClose(),
					"Remote close observation",
				);
				assertRpcConformance(
					opened.remote.isAdapterClosed() && completed,
					"Direct Close did not finish terminal and cleanup.",
				);
				await opened.finish();
			},
		),
	];
}

function createCaseFactory<T extends { cleanup(): Promise<void> }>(
	fixture: { create(): Promise<T> },
	label: string,
) {
	return (
		caseId: string,
		run: (created: T) => Promise<void>,
	): IRpcConformanceCase => ({
		caseId,
		async run() {
			const created = await within(
				fixture.create(),
				`${label} fixture creation`,
			);
			try {
				await run(created);
			} finally {
				await within(created.cleanup(), `${label} fixture cleanup`);
			}
		},
	});
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

async function testAcceptorHandoff(created: AcceptorFixture): Promise<void> {
	const firstMessage = new Uint8Array([1, 2, 3]);
	let connection: IRpcConnection | undefined;
	let insideHandoff = false;
	let observedInside = false;
	let observedFirst: Uint8Array | undefined;
	created.adapter.connection$.subscribe((value) => {
		insideHandoff = true;
		connection = value;
		value.message$.subscribe((message) => {
			observedInside = insideHandoff;
			observedFirst = message;
		});
		insideHandoff = false;
	});
	const startup = created.adapter.listen(new AbortController().signal);
	const remote = await within(created.accept(firstMessage), "Acceptor handoff");
	assertRpcConformance(
		connection !== undefined,
		"Early Connection was not handed off.",
	);
	assertRpcConformance(
		observedFirst?.[0] === firstMessage[0] &&
			observedFirst?.[1] === firstMessage[1] &&
			observedFirst?.[2] === firstMessage[2],
		"First message content changed.",
	);
	assertRpcConformance(
		!observedInside,
		"First message was emitted before the ownership barrier.",
	);
	let ready = false;
	void startup.then(() => (ready = true));
	await Promise.resolve();
	assertRpcConformance(!ready, "listen() fulfilled before ready.");
	await created.markReady();
	await within(startup, "Acceptor readiness");
	await created.completeListener();
	assertRpcConformance(
		!remote.isAdapterClosed(),
		"Listener terminal closed transferred Connection.",
	);
	await remote.closeFromRemote();
}

async function testAcceptorSource(created: AcceptorFixture): Promise<void> {
	const left: IRpcConnection[] = [];
	const right: IRpcConnection[] = [];
	const late: IRpcConnection[] = [];
	let completed = 0;
	created.adapter.connection$.subscribe({
		next: (connection) => left.push(connection),
		complete: () => (completed += 1),
	});
	created.adapter.connection$.subscribe({
		next: (connection) => right.push(connection),
		complete: () => (completed += 1),
	});
	const startup = created.adapter.listen(new AbortController().signal);
	const first = await created.accept();
	created.adapter.connection$.subscribe((connection) => late.push(connection));
	const second = await created.accept();
	await created.markReady();
	await startup;
	await created.completeListener();
	assertRpcConformance(
		left.length === 2 &&
			right.length === 2 &&
			left[0] === right[0] &&
			left[1] === right[1] &&
			late.length === 1 &&
			late[0] === left[1],
		"Accepted order or Connection identity changed.",
	);
	assertRpcConformance(completed === 2, "Listener terminal was not multicast.");
	let lateCompleted = false;
	created.adapter.connection$.subscribe({
		complete: () => (lateCompleted = true),
	});
	assertRpcConformance(
		lateCompleted,
		"Late observer missed listener terminal.",
	);
	assertRpcConformance(
		(await rejectionOf(
			created.adapter.listen(new AbortController().signal),
		)) instanceof Error,
		"Single-use Acceptor Adapter restarted.",
	);
	assertRpcConformance(
		!first.isAdapterClosed() && !second.isAdapterClosed(),
		"Listener terminal closed a transferred Connection.",
	);
	await first.closeFromRemote();
	await second.closeFromRemote();
}

async function testAcceptorAbortBeforeReady(
	created: AcceptorFixture,
): Promise<void> {
	let completed = false;
	created.adapter.connection$.subscribe({ complete: () => (completed = true) });
	const controller = new AbortController();
	const startup = created.adapter.listen(controller.signal);
	controller.abort();
	assertRpcConformance(
		isAbortError(await within(rejectionOf(startup), "Acceptor abort")),
		"Pre-ready abort did not reject AbortError.",
	);
	assertRpcConformance(completed, "Pre-ready abort did not complete source.");
}

async function testAcceptorAbortAfterReady(
	created: AcceptorFixture,
): Promise<void> {
	let completed = false;
	created.adapter.connection$.subscribe({ complete: () => (completed = true) });
	const controller = new AbortController();
	const startup = created.adapter.listen(controller.signal);
	const remote = await created.accept();
	await created.markReady();
	await startup;
	controller.abort();
	await waitFor(() => completed, "Acceptor post-ready abort");
	assertRpcConformance(completed, "Post-ready abort did not complete source.");
	assertRpcConformance(
		!remote.isAdapterClosed(),
		"Post-ready abort closed transferred Connection.",
	);
	await remote.closeFromRemote();
}

async function testAcceptorCompleteBeforeReady(
	created: AcceptorFixture,
): Promise<void> {
	let completed = false;
	created.adapter.connection$.subscribe({ complete: () => (completed = true) });
	const startup = created.adapter.listen(new AbortController().signal);
	await created.completeListener();
	assertRpcConformance(
		(await within(
			rejectionOf(startup),
			"Pre-ready listener completion",
		)) instanceof Error,
		"Listener completion before ready fulfilled listen().",
	);
	assertRpcConformance(
		completed,
		"Pre-ready completion did not terminal source.",
	);
}

async function testAcceptorFailure(created: AcceptorFixture): Promise<void> {
	const listenerError = new Error("listener failed");
	let sourceError: unknown;
	created.adapter.connection$.subscribe({
		error: (error) => (sourceError = error),
	});
	const startup = created.adapter.listen(new AbortController().signal);
	await created.failListener(listenerError);
	assertRpcConformance(
		(await within(rejectionOf(startup), "Acceptor startup failure")) ===
			listenerError && sourceError === listenerError,
		"Listener Error identity changed.",
	);
}

async function testAcceptorFailureAfterReady(
	created: AcceptorFixture,
): Promise<void> {
	const listenerError = new Error("listener lifetime failed");
	let sourceError: unknown;
	created.adapter.connection$.subscribe({
		error: (error) => (sourceError = error),
	});
	const startup = created.adapter.listen(new AbortController().signal);
	const remote = await created.accept();
	await created.markReady();
	await startup;
	await created.failListener(listenerError);
	assertRpcConformance(
		sourceError === listenerError,
		"Post-ready listener Error identity changed.",
	);
	assertRpcConformance(
		!remote.isAdapterClosed(),
		"Listener failure closed a transferred Connection.",
	);
	await remote.closeFromRemote();
}

async function testAcceptorIsolation(created: AcceptorFixture): Promise<void> {
	const connections: IRpcConnection[] = [];
	let listenerTerminal = false;
	created.adapter.connection$.subscribe({
		next: (connection) => connections.push(connection),
		complete: () => (listenerTerminal = true),
		error: () => (listenerTerminal = true),
	});
	const startup = created.adapter.listen(new AbortController().signal);
	const failedRemote = await created.accept();
	const healthyRemote = await created.accept();
	await created.markReady();
	await startup;
	await failedRemote.failFromRemote(new Error("one connection failed"));
	assertRpcConformance(
		!listenerTerminal,
		"Connection failure stopped listener.",
	);
	assertRpcConformance(connections.length === 2, "Expected two Connections.");
	const healthyConnection = connections[1];
	assertRpcConformance(
		healthyConnection !== undefined,
		"Sibling Connection missing.",
	);
	await healthyConnection.send(new Uint8Array([9]));
	assertRpcConformance(
		(await healthyRemote.receiveFromAdapter())[0] === 9,
		"Sibling Connection was affected.",
	);
	await created.completeListener();
	await healthyRemote.closeFromRemote();
}

async function testAcceptorOverflow(created: AcceptorFixture): Promise<void> {
	const controller = new AbortController();
	let count = 0;
	let completed = false;
	created.adapter.connection$.subscribe({
		next(connection) {
			count += 1;
			if (count === 2) {
				controller.abort();
				queueMicrotask(() => void connection.close());
			}
		},
		complete: () => (completed = true),
	});
	const startup = created.adapter.listen(controller.signal);
	const ordinary = await created.accept();
	await created.markReady();
	await startup;
	const overflow = await created.accept();
	await within(overflow.waitForAdapterClose(), "Overflow Direct Close");
	assertRpcConformance(
		count === 2 && completed,
		"Overflow abort did not gate listener.",
	);
	assertRpcConformance(
		overflow.isAdapterClosed(),
		"Overflow Connection did not close.",
	);
	assertRpcConformance(
		!ordinary.isAdapterClosed(),
		"Overflow close affected ordinary Connection.",
	);
	await ordinary.closeFromRemote();
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

async function openAcceptor(
	created: AcceptorFixture,
): Promise<OpenedConnection> {
	let connection: IRpcConnection | undefined;
	created.adapter.connection$.subscribe((value) => (connection = value));
	const startup = created.adapter.listen(new AbortController().signal);
	const remote = await within(created.accept(), "Acceptor handoff");
	await created.markReady();
	await within(startup, "Acceptor readiness");
	assertRpcConformance(
		connection !== undefined,
		"Acceptor did not hand off a Connection.",
	);
	return {
		connection,
		remote,
		finish: () => created.completeListener(),
	};
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		return undefined;
	} catch (error) {
		return error;
	}
}

function isAbortError(value: unknown): boolean {
	return value instanceof Error && value.name === "AbortError";
}

async function turns(count: number): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await Promise.resolve();
	}
}
