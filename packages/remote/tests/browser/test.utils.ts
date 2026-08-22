/**
 * @overview Browser-executed Default Protocol release fixture.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Subject } from "rxjs";

import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	type IRpcAcceptorAdapter,
	type IRpcConnection,
	type IRpcConnectorAdapter,
	RpcException,
} from "../../src/index";
import knownAnswerVectors from "../../wire/husky-di-rpc-1/known-answer-vectors.json";

interface IBrowserRpcService {
	add(left: number, right: number): number;
	wait(signal: AbortSignal): Promise<string>;
}

interface IBrowserMemoryLink {
	readonly acceptorIngress: Subject<Uint8Array>;
	readonly connectorIngress: Subject<Uint8Array>;
}

interface IBrowserRoundtripResult {
	readonly acceptorStatus: string;
	readonly assimilated: boolean;
	readonly canceledCode: string;
	readonly connectorStatus: string;
	readonly initialResult: number;
	readonly recoveredResult: number;
	readonly sameAcceptorPeer: boolean;
	readonly sameConnectorPeer: boolean;
	readonly shadowListenerCalls: number;
	readonly webCrypto: boolean;
	readonly webCryptoVectors: boolean;
}

const IBrowserRpcService =
	createServiceIdentifier<IBrowserRpcService>("IBrowserRpcService");

function createBrowserMemoryNetwork(): {
	readonly acceptorAdapter: IRpcAcceptorAdapter;
	createConnectorAdapter(): IRpcConnectorAdapter;
	disconnect(connectionIndex: number): void;
} {
	const acceptorConnections = new Subject<IRpcConnection>();
	const links: IBrowserMemoryLink[] = [];

	return {
		acceptorAdapter: {
			connection$: acceptorConnections.asObservable(),
			async listen(signal) {
				signal.throwIfAborted();
			},
		},
		createConnectorAdapter() {
			const connectorConnections = new Subject<IRpcConnection>();
			return {
				connection$: connectorConnections.asObservable(),
				async connect(signal) {
					signal.throwIfAborted();
					const connectorIngress = new Subject<Uint8Array>();
					const acceptorIngress = new Subject<Uint8Array>();
					const link = { connectorIngress, acceptorIngress };
					links.push(link);
					let closed = false;
					const close = async (): Promise<void> => {
						if (!closed) {
							closed = true;
							connectorIngress.complete();
							acceptorIngress.complete();
						}
					};
					const createConnection = (
						messageSource: Subject<Uint8Array>,
						peerSource: Subject<Uint8Array>,
					): IRpcConnection => ({
						message$: messageSource.asObservable(),
						async send(message) {
							if (closed) {
								throw new Error("Browser test Connection is closed.");
							}
							const snapshot = message.slice();
							await Promise.resolve();
							if (!closed) {
								peerSource.next(snapshot);
							}
						},
						close,
					});
					connectorConnections.next(
						createConnection(connectorIngress, acceptorIngress),
					);
					acceptorConnections.next(
						createConnection(acceptorIngress, connectorIngress),
					);
					connectorConnections.complete();
				},
			};
		},
		disconnect(connectionIndex) {
			const link = links[connectionIndex];
			link?.connectorIngress.complete();
			link?.acceptorIngress.complete();
		},
	};
}

async function waitFor(
	predicate: () => boolean,
	message: string,
): Promise<void> {
	const deadline = performance.now() + 5_000;
	while (!predicate()) {
		if (performance.now() >= deadline) {
			throw new Error(message);
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

function decodeHex(value: string): ArrayBuffer {
	const bytes = new Uint8Array(value.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes.buffer;
}

function encodeHex(value: ArrayBuffer): string {
	return Array.from(new Uint8Array(value), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function verifyBrowserWebCryptoVectors(): Promise<boolean> {
	const hmacVector = knownAnswerVectors.hmacSha256;
	const hmacKey = await crypto.subtle.importKey(
		"raw",
		decodeHex(hmacVector.keyHex),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const hmac = await crypto.subtle.sign(
		"HMAC",
		hmacKey,
		decodeHex(hmacVector.dataHex),
	);
	const hkdfVector = knownAnswerVectors.hkdfSha256;
	const hkdfKey = await crypto.subtle.importKey(
		"raw",
		decodeHex(hkdfVector.ikmHex),
		"HKDF",
		false,
		["deriveBits"],
	);
	const hkdf = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: decodeHex(hkdfVector.saltHex),
			info: decodeHex(hkdfVector.infoHex),
		},
		hkdfKey,
		hkdfVector.length * 8,
	);
	return (
		encodeHex(hmac) === hmacVector.tagHex &&
		encodeHex(hkdf) === hkdfVector.okmHex
	);
}

export async function runRpcBrowserRoundtrip(): Promise<IBrowserRoundtripResult> {
	const webCryptoVectors = await verifyBrowserWebCryptoVectors();
	const descriptor = createRemoteServiceDescriptor(IBrowserRpcService, {
		wireName: "browser.release.v1",
		methods: {
			add: true,
			wait: { cancelable: true },
		},
	});
	const network = createBrowserMemoryNetwork();
	const acceptor = createRpcAcceptor({
		runtimePolicy: {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 5_000,
			recoveryGraceMs: 10_000,
		},
	});
	const connector = createRpcConnector({
		runtimePolicy: {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 5_000,
			recoveryGraceMs: 10_000,
		},
	});
	const { promise: handlerStarted, resolve: resolveHandlerStarted } =
		Promise.withResolvers<void>();
	acceptor.expose(descriptor, {
		add: (left, right) => left + right,
		wait(signal) {
			resolveHandlerStarted();
			return new Promise((resolve) => {
				signal.addEventListener("abort", () => resolve("aborted"), {
					once: true,
				});
			});
		},
	});

	await acceptor.listen(network.acceptorAdapter);
	try {
		await connector.connect({ adapter: network.createConnectorAdapter() });
	} catch (error) {
		const cause =
			error instanceof Error && "cause" in error ? error.cause : undefined;
		const detail =
			cause instanceof Error ? cause.message : String(cause ?? error);
		throw new Error(
			`Browser roundtrip failed during the fresh binding: ${detail}`,
		);
	}
	const connectorPeer = connector.peer;
	const acceptorPeer = acceptor.peers[0];
	if (acceptorPeer === undefined) {
		throw new Error("Browser roundtrip did not install an Acceptor Peer.");
	}
	const remote = connector.peer.resolve(descriptor);
	const assimilated = (await Promise.resolve(remote)) === remote;
	const initialResult = await remote.add(19, 23);

	const frame = document.createElement("iframe");
	document.body.append(frame);
	const FrameAbortController = (
		frame.contentWindow as
			| (Window & { readonly AbortController: typeof AbortController })
			| null
	)?.AbortController;
	if (FrameAbortController === undefined) {
		throw new Error("Browser iframe did not expose AbortController.");
	}
	const controller = new FrameAbortController();
	let shadowListenerCalls = 0;
	Object.defineProperties(controller.signal, {
		addEventListener: {
			value: () => {
				shadowListenerCalls += 1;
			},
		},
		removeEventListener: {
			value: () => {
				shadowListenerCalls += 1;
			},
		},
	});
	const canceledCall = remote.wait(controller.signal);
	await handlerStarted;
	controller.abort();
	let canceledCode = "";
	try {
		await canceledCall;
	} catch (error) {
		if (!(error instanceof RpcException)) {
			throw error;
		}
		canceledCode = error.code;
	}
	frame.remove();

	network.disconnect(0);
	await waitFor(
		() =>
			connector.peer.state.status === "recovering" &&
			acceptor.peers[0]?.state.status === "recovering",
		"Browser roundtrip did not enter Recovery.",
	);
	await connector.connect({ adapter: network.createConnectorAdapter() });
	const recoveredResult = await remote.add(20, 22);
	const sameConnectorPeer = connector.peer === connectorPeer;
	const sameAcceptorPeer = acceptor.peers[0] === acceptorPeer;

	await connector.shutdown();
	await acceptor.shutdown();

	return {
		acceptorStatus: acceptor.state.status,
		assimilated,
		canceledCode,
		connectorStatus: connector.state.status,
		initialResult,
		recoveredResult,
		sameAcceptorPeer,
		sameConnectorPeer,
		shadowListenerCalls,
		webCrypto: typeof crypto.subtle?.digest === "function",
		webCryptoVectors,
	};
}
