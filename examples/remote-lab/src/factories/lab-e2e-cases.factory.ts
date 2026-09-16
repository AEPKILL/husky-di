/**
 * @overview Replays observable Remote and WebSocket specification scenarios against the Lab endpoint.
 * @author AEPKILL
 * @created 2026-09-12 00:19:21
 */

import {
	createRpcReconnectionConnector,
	type IRpcConnectorAdapter,
	RpcCallDirectionEnum,
	RpcCloseReasonEnum,
	RpcException,
	RpcExceptionCodeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import { createNodeWebSocketConnectorAdapter } from "@husky-di/remote-websocket/node";
import {
	LAB_SERVICE_NAMES,
	REMOTE_LAB_BROWSER_SERVICE,
	REMOTE_LAB_SERVICE,
} from "@/consts/lab-services.const";
import { LabE2ePackageEnum } from "@/enums/lab-e2e.enum";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import { createLabRecorder } from "@/factories/lab-recorder.factory";
import { createObservedConnectorAdapter } from "@/factories/observed-connector-adapter.factory";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";
import type { LabE2eCase, LabE2eCaseContext } from "@/types/lab-e2e.type";
import type { LabRecordingSnapshot } from "@/types/lab-recording.type";
import { createLabTraceContext } from "@/utils/create-lab-trace-context.util";
import { createLabTraceInterceptor } from "@/utils/create-lab-trace-interceptor.util";

export type CreateLabE2eCasesOptions = {
	readonly endpoint: string;
	readonly nodeRecorder: ILabRecorder;
};

export function createLabE2eCases({
	endpoint,
	nodeRecorder,
}: CreateLabE2eCasesOptions): readonly LabE2eCase[] {
	return [
		{
			id: "remote-bidirectional-dispatch",
			title: "Remote bidirectional exposure and dispatch",
			package: LabE2ePackageEnum.remote,
			source: "packages/remote/tests/specification/exposure.test.ts",
			run: (context) =>
				withClient(
					context,
					nodeRecorder,
					() => createWebSocketConnectorAdapter({ url: endpoint }),
					async ({ call, lab, peerId }) => {
						context.step("calling exposed service in both directions");
						const value = await call("echo", ["observable"], () =>
							lab.echo({ value: "observable" }),
						);
						if (JSON.stringify(value) !== '{"value":"observable"}')
							throw new Error("Remote echo did not preserve the legal value.");
						const callback = await call("callback", [peerId, "from-node"], () =>
							lab.callback(peerId, "from-node"),
						);
						if (callback !== `${peerId} received from-node`)
							throw new Error("Remote callback result was not returned.");
					},
				),
		},
		{
			id: "remote-cancellation",
			title: "Remote cancelable invocation",
			package: LabE2ePackageEnum.remote,
			source: "packages/remote/tests/specification/outgoing-invocation.test.ts",
			run: (context) =>
				withClient(
					context,
					nodeRecorder,
					() => createWebSocketConnectorAdapter({ url: endpoint }),
					async ({ call, lab }) => {
						context.step("canceling an admitted RPC call");
						const controller = new AbortController();
						const invocation = call("report", [false, 100], () =>
							lab.report(false, 100, controller.signal),
						);
						controller.abort();
						try {
							await invocation;
							throw new Error("Cancelable invocation unexpectedly fulfilled.");
						} catch (error) {
							if (
								!(error instanceof RpcException) ||
								error.code !== RpcExceptionCodeEnum.canceled
							)
								throw error;
						}
					},
				),
		},
		{
			id: "remote-recovery",
			title: "Remote retained Peer recovery",
			package: LabE2ePackageEnum.remote,
			source: "packages/remote/tests/specification/recovery.test.ts",
			async run(context) {
				const sockets: WebSocket[] = [];
				class ObservedWebSocket extends WebSocket {
					constructor(url: string | URL, protocols?: string | string[]) {
						super(url, protocols);
						sockets.push(this);
					}
				}
				await withClient(
					context,
					nodeRecorder,
					() =>
						createWebSocketConnectorAdapter({
							url: endpoint,
							webSocket: ObservedWebSocket,
						}),
					async ({ call, lab, peerId, reconnection }) => {
						context.step(
							"recovering an admitted paused call without redispatch",
						);
						const traceId = context.trace("recovery-report");
						const report = call(
							"report",
							[true, 0],
							() => lab.report(true, 0, undefined),
							"recovery-report",
						);
						await eventually(
							() =>
								nodeRecorder
									.snapshot()
									.calls.some(
										(item) =>
											item.traceId === traceId &&
											item.phases.some(
												(phase) => phase.phase === "handler-paused",
											),
									),
							context.signal,
						);
						sockets[0]?.close();
						await eventually(
							() =>
								sockets.length > 1 &&
								reconnection.state.status === RpcStateStatusEnum.monitoring,
							context.signal,
						);
						if (!(await call("resume", [traceId], () => lab.resume(traceId))))
							throw new Error("Recovered report could not be resumed.");
						const result = (await report) as {
							handlerEntries?: unknown;
							aborted?: unknown;
						};
						if (result.handlerEntries !== 1 || result.aborted !== false)
							throw new Error(
								"Recovery redispatched or canceled the admitted handler.",
							);
						const recoveredPeerId = await call("identify", [], () =>
							lab.identify(),
						);
						if (recoveredPeerId !== peerId)
							throw new Error("Recovery replaced the retained remote Peer.");
					},
				);
			},
		},
		{
			id: "websocket-browser-full-duplex",
			title: "WebSocket browser adapter full-duplex RPC",
			package: LabE2ePackageEnum.remoteWebSocket,
			source: "packages/remote-websocket/tests/specification.test.ts",
			run: (context) =>
				withClient(
					context,
					nodeRecorder,
					() => createWebSocketConnectorAdapter({ url: endpoint }),
					async ({ call, lab }) => {
						context.step("sending and receiving through the browser adapter");
						const result = await call("echo", ["browser-adapter"], () =>
							lab.echo("browser-adapter"),
						);
						if (result !== "browser-adapter")
							throw new Error("Browser WebSocket adapter lost the RPC result.");
					},
				),
		},
		{
			id: "websocket-node-source-conformance",
			title: "WebSocket Node adapter source conformance",
			package: LabE2ePackageEnum.remoteWebSocket,
			source:
				"packages/remote-websocket/tests/conformance.test.ts#connector.source.multicast-terminal-single-use",
			async run(context) {
				const adapter = createNodeWebSocketConnectorAdapter({ url: endpoint });
				const left: unknown[] = [];
				const right: unknown[] = [];
				let completed = 0;
				adapter.connection$.subscribe({
					next: (connection) => left.push(connection),
					complete: () => (completed += 1),
				});
				adapter.connection$.subscribe({
					next: (connection) => right.push(connection),
					complete: () => (completed += 1),
				});
				await withClient(
					context,
					nodeRecorder,
					() => adapter,
					async ({ call, lab }) => {
						context.step(
							"checking multicast handoff, hot terminal, single use, and retained ownership",
						);
						if (
							left.length !== 1 ||
							right.length !== 1 ||
							left[0] !== right[0] ||
							completed !== 2
						)
							throw new Error(
								"Connector source did not multicast one identity and terminal.",
							);
						let lateValues = 0;
						let lateCompleted = false;
						adapter.connection$.subscribe({
							next: () => (lateValues += 1),
							complete: () => (lateCompleted = true),
						});
						let restartError: unknown;
						try {
							await adapter.connect(new AbortController().signal);
						} catch (error) {
							restartError = error;
						}
						if (
							!lateCompleted ||
							lateValues !== 0 ||
							!(restartError instanceof Error)
						)
							throw new Error(
								"Connector source replayed a Connection or allowed reuse.",
							);
						const result = await call("echo", ["node-adapter"], () =>
							lab.echo("node-adapter"),
						);
						if (result !== "node-adapter")
							throw new Error(
								"Connector source terminal revoked the handed-off Connection.",
							);
					},
				);
			},
		},
		{
			id: "remote-multi-peer-dispatch",
			title: "Remote multi-Peer isolation and directed dispatch",
			package: LabE2ePackageEnum.remote,
			source: "packages/remote/tests/specification/exposure.test.ts",
			run: (context) =>
				withClient(
					context,
					nodeRecorder,
					() => createWebSocketConnectorAdapter({ url: endpoint }),
					async (first) =>
						withClient(
							context,
							nodeRecorder,
							() => createNodeWebSocketConnectorAdapter({ url: endpoint }),
							async (second) => {
								context.step(
									"calling two isolated test Peers without touching the manual Session",
								);
								if (first.peerId === second.peerId)
									throw new Error(
										"Distinct test connections shared one Peer id.",
									);
								for (const peerId of [first.peerId, second.peerId]) {
									const result = await first.call("callback", [peerId], () =>
										first.lab.callback(peerId, "observable"),
									);
									if (result !== `${peerId} received observable`)
										throw new Error(`Directed callback missed ${peerId}.`);
								}
							},
						),
				),
		},
		{
			id: "remote-termination",
			title: "Remote graceful Connector termination",
			package: LabE2ePackageEnum.remote,
			source:
				"packages/remote/tests/specification/connector-termination.test.ts",
			run: (context) =>
				withClient(
					context,
					nodeRecorder,
					() => createWebSocketConnectorAdapter({ url: endpoint }),
					async ({ call, lab, shutdown }) => {
						context.step(
							"draining an in-flight call through graceful shutdown",
						);
						const report = call("report", [false, 75], () =>
							lab.report(false, 75, undefined),
						);
						const [reportResult] = await Promise.all([report, shutdown()]);
						const result = reportResult as { aborted?: unknown };
						if (result.aborted !== false)
							throw new Error(
								"Graceful shutdown did not drain the in-flight call.",
							);
					},
				),
		},
	];
}

type ConnectedClient = {
	readonly lab: {
		echo(value: unknown): Promise<unknown>;
		report(
			pause: boolean,
			delayMs: number,
			signal: AbortSignal | undefined,
		): Promise<unknown>;
		identify(): Promise<string>;
		resume(traceId: string): Promise<boolean>;
		callback(peerId: string, message: string): Promise<string>;
	};
	readonly peerId: string;
	readonly reconnection: ReturnType<typeof createRpcReconnectionConnector>;
	snapshot(): LabRecordingSnapshot;
	call<T>(
		method: string,
		args: readonly unknown[],
		operation: () => T | Promise<T>,
		traceLabel?: string,
	): Promise<T>;
	shutdown(): Promise<void>;
};

async function withClient(
	context: LabE2eCaseContext,
	nodeRecorder: ILabRecorder,
	adapterFactory: () => IRpcConnectorAdapter,
	operation: (client: ConnectedClient) => Promise<void>,
): Promise<void> {
	const recorder = createLabRecorder(LabSideEnum.browser);
	const traceContext = createLabTraceContext();
	const reconnection = createRpcReconnectionConnector({
		interceptor: createLabTraceInterceptor(traceContext),
		adapterFactory: () =>
			createObservedConnectorAdapter(adapterFactory(), recorder),
	});
	const { connector } = reconnection;
	const events = connector.event$.subscribe((event) =>
		recorder.recordEvent(event, "e2e-peer"),
	);
	let localPeerId = "unbound";
	connector.peer.expose(REMOTE_LAB_BROWSER_SERVICE, {
		receive: (message) => `${localPeerId} received ${message}`,
	});
	const cleanupConnector = async () => {
		const errors: unknown[] = [];
		try {
			await reconnection.stop();
		} catch (error) {
			errors.push(error);
		}
		try {
			await connector.shutdown();
		} catch (error) {
			errors.push(error);
		}
		if (errors.length)
			throw new AggregateError(errors, "Test-owned Connector cleanup failed.");
	};
	const releaseOwnership = context.own(cleanupConnector);
	const stop = () => void reconnection.stop();
	context.signal.addEventListener("abort", stop, { once: true });
	let operationError: unknown;
	let cleanupError: unknown;
	let peerId: string | undefined;
	try {
		await reconnection.connect();
		const lab = connector.peer.resolve(REMOTE_LAB_SERVICE);
		const identifiedPeerId = await lab.identify();
		peerId = identifiedPeerId;
		localPeerId = identifiedPeerId;
		const call = <T>(
			method: string,
			args: readonly unknown[],
			invoke: () => T | Promise<T>,
			traceLabel = method,
		) => {
			const traceId = context.trace(traceLabel);
			return recorder.run(
				{
					traceId,
					peerId: identifiedPeerId,
					side: LabSideEnum.browser,
					direction: RpcCallDirectionEnum.outgoing,
					service: LAB_SERVICE_NAMES.lab,
					method,
				},
				args,
				() => traceContext.run(traceId, invoke),
			);
		};
		await operation({
			lab,
			peerId: identifiedPeerId,
			reconnection,
			call,
			snapshot: () => recorder.snapshot(),
			async shutdown() {
				const shutdown = connector.shutdown();
				if (connector.shutdown() !== shutdown)
					throw new Error("Connector did not cache graceful shutdown.");
				await shutdown;
				if (
					connector.state.status !== RpcStateStatusEnum.closed ||
					connector.state.reason !== RpcCloseReasonEnum.gracefulShutdown
				)
					throw new Error("Connector did not finish graceful shutdown.");
			},
		});
	} catch (error) {
		operationError = error;
	} finally {
		context.signal.removeEventListener("abort", stop);
		try {
			await context.cleanup(cleanupConnector);
		} catch (error) {
			cleanupError = error;
		} finally {
			releaseOwnership();
		}
		if (peerId) {
			const browser = recorder.snapshot();
			context.capture(
				{ side: LabSideEnum.browser, snapshot: browser },
				{
					side: LabSideEnum.node,
					snapshot: selectNodeRecording(
						nodeRecorder.snapshot(),
						browser,
						peerId,
					),
				},
			);
		}
		events.unsubscribe();
	}
	if (cleanupError !== undefined) throw cleanupError;
	if (operationError !== undefined) {
		if (!peerId && !context.signal.aborted)
			context.failInfrastructure(operationError);
		throw operationError;
	}
}

function selectNodeRecording(
	node: LabRecordingSnapshot,
	browser: LabRecordingSnapshot,
	peerId: string,
): LabRecordingSnapshot {
	const sessionId = browser.sessionId;
	return {
		...(sessionId ? { sessionId } : {}),
		connections: node.connections.filter(
			(connection) => connection.sessionId === sessionId,
		),
		calls: node.calls.filter((call) => call.peerId === peerId),
		entries: node.entries.filter(
			(entry) =>
				entry.transportMessage?.sessionId === sessionId ||
				entry.summary.startsWith(`${peerId} ·`),
		),
	};
}

async function eventually(
	check: () => boolean,
	signal: AbortSignal,
): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!check()) {
		if (signal.aborted) throw signal.reason;
		if (Date.now() >= deadline)
			throw new Error("Observable recovery did not complete within 3 seconds.");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}
