/**
 * @overview Verifies connector startup.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { type Observable, Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	createRpcConnector,
	type IRpcConnectorAdapter,
	type RpcEvent,
	RpcEventTypeEnum,
	type RpcProtocolConnectorFactory,
	RpcStateStatusEnum,
} from "../../src/index";
import type { IRpcConnection, IRpcProtocolSession } from "../../src/protocol";
import {
	createProtocolHarness,
	createReconnectionProtocolHarness,
	expectSchemaFailureTypeError,
} from "./test.utils";

describe("Adapter startup and Protocol handoff", () => {
	it("RPC-START-005 parses ordinary Connector attempt configuration objects", async () => {
		const metadata = Symbol("metadata");
		const reads: string[] = [];
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: harness.protocolFactory,
		});
		const connectionSource = new Subject<IRpcConnection>();
		const callableConnectionSource = Object.assign(() => undefined, {
			subscribe: connectionSource.subscribe.bind(connectionSource),
		});
		const adapter = new (class implements IRpcConnectorAdapter {
			get connection$(): Observable<IRpcConnection> {
				reads.push("adapter.connection$");
				return callableConnectionSource as unknown as Observable<IRpcConnection>;
			}

			async connect(): Promise<void> {
				connectionSource.next({
					message$: new Subject<Uint8Array>().asObservable(),
					async send() {},
					async close() {},
				});
				connectionSource.complete();
			}
		})();
		const options = new (class {
			readonly [metadata] = true;

			get adapter(): IRpcConnectorAdapter {
				reads.push("options.adapter");
				return adapter;
			}
		})();

		await expect(connector.connect(options)).resolves.toBeUndefined();
		expect(reads).toEqual(
			expect.arrayContaining(["options.adapter", "adapter.connection$"]),
		);
		await connector.close();
	});

	it("RPC-START-001 RPC-START-005 gates Connector availability before parsing options", async () => {
		const connector = createRpcConnector();
		await connector.close();
		let adapterReads = 0;
		const options = new (class {
			get adapter(): IRpcConnectorAdapter {
				adapterReads += 1;
				throw new Error("Unavailable Connector must not read options.");
			}
		})();

		await expect(connector.connect(options)).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(adapterReads).toBe(0);
	});

	it("RPC-START-005 rejects unknown Connector attempt options without starting its Adapter", async () => {
		const connector = createRpcConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
		});
		let adapterStarts = 0;
		const connectionSource = new Subject<IRpcConnection>();
		const adapter: IRpcConnectorAdapter = {
			connection$: connectionSource.asObservable(),
			async connect() {
				adapterStarts += 1;
				const error = new Error("Adapter must not start.");
				connectionSource.error(error);
				throw error;
			},
		};

		for (const options of [
			{ adapter, unknown: true },
			{ adapter, ["__proto__"]: true },
		]) {
			expectSchemaFailureTypeError(
				await connector
					.connect(options as never)
					.catch((error: unknown) => error),
			);
		}

		expect(adapterStarts).toBe(0);
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-START-005 rejects a pre-aborted Connector attempt without touching its Adapter", async () => {
		const { connectorFactory } = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: connectorFactory,
		});
		const controller = new AbortController();
		controller.abort();
		let adapterReads = 0;
		let adapterStarts = 0;
		const adapter = Object.defineProperty(
			{
				async connect() {
					adapterStarts += 1;
				},
			},
			"connection$",
			{
				get() {
					adapterReads += 1;
					return new Subject<IRpcConnection>().asObservable();
				},
			},
		) as unknown as IRpcConnectorAdapter;

		await expect(
			connector.connect({ adapter, signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });

		expect(adapterReads).toBe(0);
		expect(adapterStarts).toBe(0);
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-START-005 aborts an unsettled fresh attempt and releases Connector authority", async () => {
		const { connectorFactory } = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: connectorFactory,
		});
		const controller = new AbortController();
		let adapterSignal: AbortSignal | undefined;
		const adapter: IRpcConnectorAdapter = {
			connection$: new Subject<IRpcConnection>().asObservable(),
			connect(signal) {
				adapterSignal = signal;
				return new Promise<void>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(new DOMException("Adapter aborted.", "AbortError")),
						{ once: true },
					);
				});
			},
		};

		const startup = connector.connect({ adapter, signal: controller.signal });
		expect(connector.peer.state).toEqual({ status: "connecting" });
		controller.abort();

		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		expect(adapterSignal?.aborted).toBe(true);
		expect(connector.peer.state).toEqual({ status: "unbound" });
		await expect(
			connector.connect({ adapter: undefined as never }),
		).rejects.toBeInstanceOf(TypeError);
	});

	it("RPC-START-005 ignores a reentrant abort after binding success", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
			return {
				bind() {
					return Promise.resolve().then(() => {
						if (host.attachSession(session) === undefined) {
							throw new Error("The test Session was not attached.");
						}
					});
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const controller = new AbortController();
		const connectionSource = new Subject<IRpcConnection>();
		let closeCalls = 0;
		const connector = createRpcConnector({ protocolFactory });
		connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.peerOpened) {
				controller.abort("caller-controlled reason");
			}
		});

		await connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {
							closeCalls += 1;
						},
					});
					connectionSource.complete();
				},
			},
			signal: controller.signal,
		});

		expect(closeCalls).toBe(0);
		expect(connector.peer.state).toEqual({ status: "connected" });
	});

	it("RPC-START-005 keeps AbortError authoritative when abort wins an ordinary-failure race", async () => {
		const connector = createRpcConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
		});
		const controller = new AbortController();
		const connectionSource = new Subject<IRpcConnection>();
		const adapterFailure = new Error("Adapter credential=secret");
		const abortReason = new Error("Caller credential=secret");
		const startup = connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					queueMicrotask(() => {
						connectionSource.error(adapterFailure);
						queueMicrotask(() => controller.abort(abortReason));
					});
				},
			},
			signal: controller.signal,
		});

		const error = await startup.catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(DOMException);
		expect(error).toMatchObject({ name: "AbortError" });
		expect(error).not.toBe(adapterFailure);
		expect(error).not.toBe(abortReason);
		expect(JSON.stringify(error)).not.toContain("secret");
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-START-005 lets reentrant Owner termination win before startup settles", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
			return {
				bind() {
					return Promise.resolve().then(() => {
						if (host.attachSession(session) === undefined) {
							throw new Error("The test Session was not attached.");
						}
					});
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const connector = createRpcConnector({ protocolFactory });
		const events: RpcEvent[] = [];
		let closeTask: Promise<void> | undefined;
		connector.event$.subscribe((event) => events.push(event));
		connector.peer.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.connected) {
				closeTask = connector.close();
			}
		});
		const connectionSource = new Subject<IRpcConnection>();

		const startup = connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {},
					});
					connectionSource.complete();
				},
			},
		});

		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		await closeTask;
		expect(events.map((event) => event.type)).not.toContain(
			RpcEventTypeEnum.peerOpened,
		);
	});
});
