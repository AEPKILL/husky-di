/**
 * @overview Acceptor Adapter source, startup, handoff and ownership conformance cases.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcAcceptorAdapterConformanceFixture } from "@/conformance/rpc-conformance.interface";
import {
	assertRpcConformance,
	type IRpcConformanceCase,
	waitFor,
	within,
} from "@/conformance/rpc-conformance.util";
import {
	createCaseFactory,
	createConnectionCases,
	isAbortError,
	rejectionOf,
} from "@/conformance/rpc-connection-conformance.util";
import type {
	AcceptorFixture,
	OpenedConnection,
} from "@/conformance/types/rpc-adapter-case.type";
import type { IRpcConnection } from "@/modules/transport";

/** Creates the stable Acceptor Adapter conformance cases documented by `/conformance`. */
export function createAcceptorAdapterConformanceCases(
	fixture: IRpcAcceptorAdapterConformanceFixture,
): IRpcConformanceCase[] {
	const wrap = createCaseFactory(fixture, "Acceptor");
	return [
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
	];
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
