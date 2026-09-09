/**
 * @overview Verifies acceptor termination.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	createRpcAcceptor,
	type RpcEvent,
	type RpcProtocolAcceptorFactory,
} from "../../src/index";
import type {
	IRpcConnection,
	IRpcProtocolAcceptorHost,
	IRpcProtocolSession,
} from "../../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/protocol";
import { createProtocolHarness } from "./test.utils";

describe("Acceptor Topology Owner termination", () => {
	it("RPC-LIFE-001 RPC-LIFE-002 RPC-CLOSE-003 gives an empty Acceptor distinct cached shutdown and close modes", async () => {
		const gracefulHarness = createProtocolHarness();
		const graceful = createRpcAcceptor({
			protocolFactory: gracefulHarness.acceptorFactory,
		});
		const gracefulEvents: RpcEvent[] = [];
		graceful.event$.subscribe((event) => gracefulEvents.push(event));

		const gracefulTask = graceful.shutdown();
		expect(graceful.state).toEqual({ status: "draining" });
		expect(graceful.shutdown()).toBe(gracefulTask);
		await gracefulTask;

		expect(graceful.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
		expect(graceful.peers).toEqual([]);
		expect(gracefulEvents.map((event) => event.type)).toEqual([
			"owner-draining",
			"owner-closing",
			"topology-closed",
		]);
		expect(gracefulHarness.calls).toMatchObject({
			shutdown: 1,
			close: 0,
			cleanup: 1,
		});
		expect(graceful.close()).toBe(gracefulTask);

		const forcedHarness = createProtocolHarness();
		const forced = createRpcAcceptor({
			protocolFactory: forcedHarness.acceptorFactory,
		});
		const forcedEvents: RpcEvent[] = [];
		forced.event$.subscribe((event) => forcedEvents.push(event));

		const forcedTask = forced.close();
		expect(forced.state).toEqual({ status: "closing" });
		expect(forced.close()).toBe(forcedTask);
		expect(forced.shutdown()).toBe(forcedTask);
		await forcedTask;

		expect(forced.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(forced.peers).toEqual([]);
		expect(forcedEvents.map((event) => event.type)).toEqual([
			"owner-closing",
			"topology-closed",
		]);
		expect(forcedHarness.calls).toMatchObject({
			shutdown: 0,
			close: 1,
			cleanup: 1,
		});
	});

	it("RPC-SHUTDOWN-001 aborts and unsubscribes a ready listener before cleanup", async () => {
		const harness = createProtocolHarness();
		const connectionSource = new Subject<IRpcConnection>();
		let listenerSignal: AbortSignal | undefined;
		let listenerTeardowns = 0;
		const acceptor = createRpcAcceptor({
			protocolFactory: harness.acceptorFactory,
		});

		await acceptor.listen({
			connection$: new Observable<IRpcConnection>((subscriber) => {
				const subscription = connectionSource.subscribe(subscriber);
				return () => {
					listenerTeardowns += 1;
					subscription.unsubscribe();
				};
			}),
			async listen(signal) {
				listenerSignal = signal;
			},
		});
		expect(acceptor.state).toEqual({
			status: "active",
			listener: { status: "listening" },
		});

		const task = acceptor.shutdown();
		expect(listenerSignal?.aborted).toBe(true);
		expect(listenerTeardowns).toBe(1);
		connectionSource.next({
			message$: new Subject<Uint8Array>().asObservable(),
			async send() {},
			async close() {},
		});
		await task;

		expect(harness.calls.acceptorAccept).toBe(0);
		expect(harness.calls).toMatchObject({
			shutdown: 1,
			close: 0,
			cleanup: 1,
		});
	});

	it("RPC-SHUTDOWN-001 rejects a starting listener with AbortError on forced close", async () => {
		const harness = createProtocolHarness();
		let listenerSignal: AbortSignal | undefined;
		let listenerTeardowns = 0;
		let resolveReady: (() => void) | undefined;
		const acceptor = createRpcAcceptor({
			protocolFactory: harness.acceptorFactory,
		});
		const startup = acceptor.listen({
			connection$: new Observable<IRpcConnection>(() => {
				return () => {
					listenerTeardowns += 1;
				};
			}),
			listen(signal) {
				listenerSignal = signal;
				return new Promise<void>((resolve) => {
					resolveReady = resolve;
				});
			},
		});
		const startupOutcome = startup.then(
			() => undefined,
			(error: unknown) => error,
		);

		const task = acceptor.close();
		expect(listenerSignal?.aborted).toBe(true);
		expect(listenerTeardowns).toBe(1);
		const startupError = await startupOutcome;
		expect(startupError).toBeInstanceOf(DOMException);
		expect(startupError).toMatchObject({ name: "AbortError" });
		await task;

		resolveReady?.();
		await Promise.resolve();
		expect(acceptor.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(harness.calls).toMatchObject({
			shutdown: 0,
			close: 1,
			cleanup: 1,
		});
	});

	it("RPC-SHUTDOWN-001 rejects a Connection emitted reentrantly by listener abort", async () => {
		const harness = createProtocolHarness();
		const connectionSource = new Subject<IRpcConnection>();
		let connectionCloseCalls = 0;
		const connection: IRpcConnection = {
			message$: new Subject<Uint8Array>().asObservable(),
			async send() {},
			async close() {
				connectionCloseCalls += 1;
			},
		};
		const acceptor = createRpcAcceptor({
			protocolFactory: harness.acceptorFactory,
		});
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen(signal) {
				signal.addEventListener(
					"abort",
					() => connectionSource.next(connection),
					{ once: true },
				);
			},
		});

		await acceptor.shutdown();
		await Promise.resolve();

		expect(harness.calls.acceptorAccept).toBe(0);
		expect(connectionCloseCalls).toBe(1);
	});

	it("RPC-SHUTDOWN-002 drains connected peers and locally forces recovering peers", async () => {
		let acceptorHost: IRpcProtocolAcceptorHost | undefined;
		let resolveShutdown: (() => void) | undefined;
		let shutdownCalls = 0;
		let closeCalls = 0;
		let cleanupCalls = 0;
		let recoveringForceCalls = 0;
		const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
			acceptorHost = host;
			return {
				async accept() {},
				shutdown() {
					shutdownCalls += 1;
					return new Promise<void>((resolve) => {
						resolveShutdown = resolve;
					});
				},
				close() {
					closeCalls += 1;
				},
				async cleanup() {
					cleanupCalls += 1;
				},
			};
		};
		const acceptor = createRpcAcceptor({ protocolFactory });
		const connectedSession: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const recoveringSession: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				recoveringForceCalls += 1;
			},
		};
		const connectedHost = acceptorHost?.admitSession(connectedSession);
		const recoveringHost = acceptorHost?.admitSession(recoveringSession);
		if (connectedHost === undefined || recoveringHost === undefined) {
			throw new Error("Expected both test Sessions to be admitted.");
		}
		const connectedPeer = acceptor.peers[0];
		const recoveringPeer = acceptor.peers[1];
		if (connectedPeer === undefined || recoveringPeer === undefined) {
			throw new Error("Expected both admitted peers.");
		}
		recoveringHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		const events: RpcEvent[] = [];
		acceptor.event$.subscribe((event) => events.push(event));

		const task = acceptor.shutdown();
		expect(acceptor.state).toEqual({ status: "draining" });
		expect(connectedPeer.state).toEqual({
			status: "draining",
			reason: "graceful-shutdown",
		});
		expect(recoveringPeer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(acceptor.peers).toEqual([connectedPeer]);
		expect(recoveringForceCalls).toBe(1);
		expect(events.map((event) => event.type)).toEqual([
			"owner-draining",
			"peer-draining",
			"peer-closed",
		]);
		expect({ shutdownCalls, closeCalls, cleanupCalls }).toEqual({
			shutdownCalls: 1,
			closeCalls: 0,
			cleanupCalls: 0,
		});

		resolveShutdown?.();
		await task;

		expect(connectedPeer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
		expect(acceptor.peers).toEqual([]);
		expect(events.map((event) => event.type)).toEqual([
			"owner-draining",
			"peer-draining",
			"peer-closed",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect({ shutdownCalls, closeCalls, cleanupCalls }).toEqual({
			shutdownCalls: 1,
			closeCalls: 0,
			cleanupCalls: 1,
		});
	});
});
