/**
 * @overview Verifies adapter handoff.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	createRpcAcceptor,
	createRpcConnector,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import type {
	IRpcConnection,
	IRpcProtocolConnectorHost,
	IRpcProtocolSession,
} from "../../src/protocol";
import { createProtocolHarness } from "./test.utils";

describe("Adapter startup and Protocol handoff", () => {
	it("RPC-START-002 RPC-TRANSPORT-008 RPC-SPI-008 subscribes and binds inside the Connector handoff barrier", async () => {
		const connectionSubject = new Subject<IRpcConnection>();
		const messageSubject = new Subject<Uint8Array>();
		const receivedMessages: Uint8Array[] = [];
		let connectionSourceSubscribed = false;
		let insideHandoffNotification = false;
		let bindRanInsideNotification = false;
		let releaseBinding: (() => void) | undefined;
		let connectorHost: IRpcProtocolConnectorHost | undefined;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const connection: IRpcConnection = {
			message$: messageSubject.asObservable(),
			async send() {},
			async close() {},
		};
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
			connectorHost = host;
			return {
				bind(boundConnection) {
					bindRanInsideNotification = insideHandoffNotification;
					boundConnection.message$.subscribe((message) =>
						receivedMessages.push(message),
					);
					return new Promise<void>((resolve) => {
						releaseBinding = () => {
							expect(host.attachSession(session)).toBeDefined();
							resolve();
						};
					});
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const adapter = {
			connection$: new Observable<IRpcConnection>((subscriber) => {
				connectionSourceSubscribed = true;
				return connectionSubject.subscribe(subscriber);
			}),
			async connect() {
				expect(connectionSourceSubscribed).toBe(true);
				insideHandoffNotification = true;
				connectionSubject.next(connection);
				insideHandoffNotification = false;
				messageSubject.next(Uint8Array.of(7));
				connectionSubject.complete();
			},
		};

		const connector = createRpcConnector({ protocolFactory });
		const startup = connector.connect({ adapter });
		expect(connector.peer.state).toEqual({ status: "connecting" });
		expect(bindRanInsideNotification).toBe(true);
		expect(receivedMessages).toEqual([Uint8Array.of(7)]);
		expect(connectorHost).toBeDefined();

		let settled = false;
		void startup.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		releaseBinding?.();
		await startup;
		expect(connector.peer.state).toEqual({ status: "connected" });
	});

	it("RPC-START-002 RPC-START-004 rejects an unattached fresh binding, closes it, and restores unbound", async () => {
		const harness = createProtocolHarness();
		const connectionSubject = new Subject<IRpcConnection>();
		let closeCalls = 0;
		const connection: IRpcConnection = {
			message$: new Subject<Uint8Array>().asObservable(),
			async send() {},
			async close() {
				closeCalls += 1;
			},
		};
		const connector = createRpcConnector({
			protocolFactory: harness.connectorFactory,
		});

		await expect(
			connector.connect({
				adapter: {
					connection$: connectionSubject.asObservable(),
					async connect() {
						connectionSubject.next(connection);
						connectionSubject.complete();
					},
				},
			}),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(closeCalls).toBe(1);
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-TRANSPORT-008 rejects a Connector Adapter that completes without handoff", async () => {
		const harness = createProtocolHarness();
		const connectionSubject = new Subject<IRpcConnection>();
		const connector = createRpcConnector({
			protocolFactory: harness.connectorFactory,
		});
		const startup = connector.connect({
			adapter: {
				connection$: connectionSubject.asObservable(),
				async connect() {
					connectionSubject.complete();
				},
			},
		});

		const outcome = await Promise.race([
			startup.then(
				() => "fulfilled",
				(error: unknown) =>
					typeof error === "object" &&
					error !== null &&
					Reflect.get(error, "code") === "unavailable"
						? "unavailable"
						: "other-error",
			),
			new Promise<string>((resolve) => {
				setTimeout(() => resolve("timeout"), 20);
			}),
		]);
		expect(outcome).toBe("unavailable");
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-START-003 RPC-TRANSPORT-009 RPC-SPI-008 separates Acceptor readiness from Session admission", async () => {
		const connectionSubject = new Subject<IRpcConnection>();
		const messageSubject = new Subject<Uint8Array>();
		const receivedMessages: Uint8Array[] = [];
		let connectionSourceSubscribed = false;
		let insideHandoffNotification = false;
		let acceptRanInsideNotification = false;
		let releaseReady: (() => void) | undefined;
		let releaseAcceptance: (() => void) | undefined;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const connection: IRpcConnection = {
			message$: messageSubject.asObservable(),
			async send() {},
			async close() {},
		};
		const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
			return {
				accept(boundConnection) {
					acceptRanInsideNotification = insideHandoffNotification;
					boundConnection.message$.subscribe((message) =>
						receivedMessages.push(message),
					);
					return new Promise<void>((resolve) => {
						releaseAcceptance = () => {
							expect(host.admitSession(session)).toBeDefined();
							resolve();
						};
					});
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const adapter = {
			connection$: new Observable<IRpcConnection>((subscriber) => {
				connectionSourceSubscribed = true;
				return connectionSubject.subscribe(subscriber);
			}),
			listen() {
				expect(connectionSourceSubscribed).toBe(true);
				insideHandoffNotification = true;
				connectionSubject.next(connection);
				insideHandoffNotification = false;
				messageSubject.next(Uint8Array.of(9));
				return new Promise<void>((resolve) => {
					releaseReady = resolve;
				});
			},
		};

		const acceptor = createRpcAcceptor({ protocolFactory });
		const startup = acceptor.listen(adapter);
		expect(acceptor.state).toEqual({
			status: "active",
			listener: { status: "starting" },
		});
		expect(acceptRanInsideNotification).toBe(true);
		expect(receivedMessages).toEqual([Uint8Array.of(9)]);
		expect(acceptor.peers).toEqual([]);

		releaseReady?.();
		await startup;
		expect(acceptor.state).toEqual({
			status: "active",
			listener: { status: "listening" },
		});
		expect(acceptor.peers).toEqual([]);

		releaseAcceptance?.();
		await Promise.resolve();
		expect(acceptor.peers).toHaveLength(1);
		expect(acceptor.peers[0]?.state).toEqual({ status: "connected" });

		connectionSubject.complete();
		expect(acceptor.state).toEqual({
			status: "active",
			listener: {
				status: "stopped",
				outcome: "normal",
				reason: "completed",
			},
		});
		expect(acceptor.peers).toHaveLength(1);
	});

	it("RPC-START-004 maps Acceptor pre-ready completion and source error without hanging", async () => {
		const completedHarness = createProtocolHarness();
		const completedSource = new Subject<IRpcConnection>();
		const completedAcceptor = createRpcAcceptor({
			protocolFactory: completedHarness.acceptorFactory,
		});
		const completedStartup = completedAcceptor.listen({
			connection$: completedSource.asObservable(),
			listen() {
				completedSource.complete();
				return new Promise<void>(() => {});
			},
		});
		await expect(completedStartup).rejects.toMatchObject({
			code: "unavailable",
			cause: undefined,
		});
		expect(completedAcceptor.state).toEqual({
			status: "active",
			listener: {
				status: "stopped",
				outcome: "normal",
				reason: "completed",
			},
		});

		const cause = new Error("listener failed");
		const failedHarness = createProtocolHarness();
		const failedSource = new Subject<IRpcConnection>();
		const failedAcceptor = createRpcAcceptor({
			protocolFactory: failedHarness.acceptorFactory,
		});
		const failedStartup = failedAcceptor.listen({
			connection$: failedSource.asObservable(),
			listen() {
				failedSource.error(cause);
				return Promise.reject(cause);
			},
		});
		await expect(failedStartup).rejects.toMatchObject({
			code: "unavailable",
			cause,
		});
		expect(failedAcceptor.state).toEqual({
			status: "active",
			listener: { status: "stopped", outcome: "failed", error: cause },
		});
	});

	it("RPC-START-003 RPC-START-004 keeps a ready listener fulfilled and isolates accept failure", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		const messageSource = new Subject<Uint8Array>();
		const sourceFailure = new Error("source lifetime failed");
		let closeCalls = 0;
		const protocolFactory: RpcProtocolAcceptorFactory = () => {
			return {
				async accept() {
					throw new Error("one connection failed");
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const acceptor = createRpcAcceptor({ protocolFactory });
		const startup = acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen() {},
		});
		await startup;
		connectionSource.next({
			message$: messageSource.asObservable(),
			async send() {},
			async close() {
				closeCalls += 1;
			},
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(closeCalls).toBe(1);
		expect(acceptor.state).toEqual({
			status: "active",
			listener: { status: "listening" },
		});

		connectionSource.error(sourceFailure);
		expect(acceptor.state).toEqual({
			status: "active",
			listener: {
				status: "stopped",
				outcome: "failed",
				error: sourceFailure,
			},
		});
		await expect(startup).resolves.toBeUndefined();
	});
});
