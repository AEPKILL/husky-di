/**
 * @overview Browser-executed Default Protocol release fixture.
 * @author AEPKILL
 * @created 2026-08-19 09:27:48
 */

import { createServiceIdentifier } from "@husky-di/core";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	RpcException,
} from "../../src/index";
import {
	createBrowserMemoryNetwork,
	type IBrowserWireRecord,
	waitFor,
} from "./network/test.utils";

export { runRpcBrowserStreams } from "./streams/test.utils";

export async function runRpcBrowserRoundtrip(): Promise<IBrowserRoundtripResult> {
	const descriptor = createRemoteServiceDescriptor(IBrowserRpcService, {
		wireName: "browser.release.v1",
		members: {
			add: { kind: "function" },
			wait: { kind: "function", cancelable: true },
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
	const freshAccept = findBrowserWireRecord(
		network.records,
		0,
		"acceptor",
		"accept",
	);
	const resumeRequest = findBrowserWireRecord(
		network.records,
		1,
		"connector",
		"resume",
	);
	const resumeAccept = findBrowserWireRecord(
		network.records,
		1,
		"acceptor",
		"accept",
	);
	const freshResumeToken = freshAccept?.resumeToken;
	const resumedToken = resumeRequest?.resumeToken;
	const resumeTokenCanonical =
		typeof freshResumeToken === "string" &&
		base64Url32Pattern.test(freshResumeToken);
	const resumeTokenStable =
		resumeTokenCanonical && resumedToken === freshResumeToken;
	const profileV2 =
		freshAccept?.profile === "husky-di-rpc/2" &&
		resumeRequest?.profile === "husky-di-rpc/2" &&
		resumeAccept?.profile === "husky-di-rpc/2";
	const resumeAcceptOmitsToken =
		resumeAccept !== undefined && !Object.hasOwn(resumeAccept, "resumeToken");

	await connector.shutdown();
	await acceptor.shutdown();

	return {
		acceptorStatus: acceptor.state.status,
		assimilated,
		browserCsprng: typeof crypto.getRandomValues === "function",
		canceledCode,
		connectorStatus: connector.state.status,
		initialResult,
		profileV2,
		recoveredResult,
		resumeAcceptOmitsToken,
		resumeTokenCanonical,
		resumeTokenStable,
		sameAcceptorPeer,
		sameConnectorPeer,
		shadowListenerCalls,
	};
}

interface IBrowserRpcService {
	add(left: number, right: number): number;
	wait(signal: AbortSignal): Promise<string>;
}

interface IBrowserRoundtripResult {
	readonly acceptorStatus: string;
	readonly assimilated: boolean;
	readonly browserCsprng: boolean;
	readonly canceledCode: string;
	readonly connectorStatus: string;
	readonly initialResult: number;
	readonly profileV2: boolean;
	readonly recoveredResult: number;
	readonly resumeAcceptOmitsToken: boolean;
	readonly resumeTokenCanonical: boolean;
	readonly resumeTokenStable: boolean;
	readonly sameAcceptorPeer: boolean;
	readonly sameConnectorPeer: boolean;
	readonly shadowListenerCalls: number;
}

const base64Url32Pattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

const IBrowserRpcService =
	createServiceIdentifier<IBrowserRpcService>("IBrowserRpcService");

function findBrowserWireRecord(
	records: readonly IBrowserWireRecord[],
	connectionIndex: number,
	origin: IBrowserWireRecord["origin"],
	kind: string,
): Readonly<Record<string, unknown>> | undefined {
	return records.find(
		(entry) =>
			entry.connectionIndex === connectionIndex &&
			entry.origin === origin &&
			entry.record.kind === kind,
	)?.record;
}
