/**
 * @overview Owns real Lab business handlers, scoped exposures, and cooperative application pause points.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { setTimeout } from "node:timers/promises";
import {
	type IRpcAcceptor,
	type IRpcPeer,
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
	RpcException,
	RpcExceptionCodeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import {
	LAB_SERVICE_NAMES,
	REMOTE_LAB_BROWSER_SERVICE,
	REMOTE_LAB_SERVICE,
	REMOTE_PEER_LAB_SERVICE,
	REMOTE_SHIPPING_SERVICE,
} from "@/consts/lab-services.const";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import type { ILabHost } from "@/interfaces/lab-host.interface";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";
import type { ILabService } from "@/interfaces/lab-service.interface";
import type { ShippingQuote } from "@/types/lab-server.type";

export type CreateLabHostOptions = {
	readonly acceptor: IRpcAcceptor;
	readonly recorder: ILabRecorder;
};

export function createLabHost({
	acceptor,
	recorder,
}: CreateLabHostOptions): ILabHost {
	const instanceId = crypto.randomUUID();
	const peers = new Map<IRpcPeer, PeerEntry>();
	const pausedReports = new Map<string, PausedReport>();
	let nextPeerId = 0;
	let nextCallbackId = 0;
	const shipping = {
		quote: (traceId: string, from: string, to: string, kg: number) =>
			record(
				"acceptor",
				LAB_SERVICE_NAMES.shipping,
				"quote",
				traceId,
				[from, to, kg],
				() => quote(from, to, kg),
			),
	};
	let globalCleanup: (() => void) | undefined = acceptor.expose(
		REMOTE_SHIPPING_SERVICE,
		shipping,
	);

	function record<T>(
		peerId: string,
		service: string,
		method: string,
		traceId: string,
		args: readonly unknown[],
		operation: () => T | Promise<T>,
	) {
		validateText(traceId, "traceId", 160);
		return recorder.run(
			{
				traceId,
				peerId,
				side: LabSideEnum.node,
				direction: RpcCallDirectionEnum.incoming,
				service,
				method,
			},
			args,
			operation,
		);
	}

	function findPeer(peerId: string): PeerEntry {
		const entry = [...peers.values()].find((entry) => entry.id === peerId);
		if (!entry) throw new TypeError("Unknown Lab peer.");
		return entry;
	}

	function setPeerExposure(entry: PeerEntry, enabled: boolean): boolean {
		validateBoolean(enabled);
		if (enabled)
			entry.cleanup ??= entry.peer.expose(REMOTE_PEER_LAB_SERVICE, {
				inspect: () => entry.id,
			});
		else {
			entry.cleanup?.();
			entry.cleanup = undefined;
		}
		return enabled;
	}

	function resume(traceId: string): boolean {
		const paused = pausedReports.get(traceId);
		if (!paused) return false;
		pausedReports.delete(traceId);
		recorder.mark(traceId, "handler-resumed", {
			aborted: paused.signal.aborted,
		});
		paused.resume();
		return true;
	}

	function callback(peerId: string, message: string): Promise<string> {
		validateText(message, "message", 500);
		const entry = findPeer(peerId);
		const traceId = `node-callback-${++nextCallbackId}`;
		return recorder.run(
			{
				traceId,
				peerId,
				side: LabSideEnum.node,
				direction: RpcCallDirectionEnum.outgoing,
				service: LAB_SERVICE_NAMES.browser,
				method: "receive",
			},
			[message],
			() =>
				entry.peer
					.resolve(REMOTE_LAB_BROWSER_SERVICE)
					.receive(traceId, message),
		);
	}

	return {
		openPeer(peer) {
			const entry: PeerEntry = {
				peer,
				id: `peer-${++nextPeerId}`,
				handlerEntries: 0,
				cleanup: undefined,
			};
			peers.set(peer, entry);
			setPeerExposure(entry, true);
			const run = <T>(
				method: string,
				traceId: string,
				args: readonly unknown[],
				operation: () => T | Promise<T>,
			) =>
				record(
					entry.id,
					LAB_SERVICE_NAMES.lab,
					method,
					traceId,
					args,
					operation,
				);
			const service: ILabService = {
				identify: () => entry.id,
				identifyServer: () => instanceId,
				quote: (traceId, from, to, kg) =>
					run("quote", traceId, [from, to, kg], () => quote(from, to, kg)),
				echo: (traceId, value) => run("echo", traceId, [value], () => value),
				fail: (traceId) =>
					run("fail", traceId, [], () => {
						throw new Error("Intentional Lab handler failure.");
					}),
				report: (traceId, pause, delayMs, signal) =>
					run("report", traceId, [pause, delayMs], async () => {
						validateBoolean(pause);
						if (
							!Number.isSafeInteger(delayMs) ||
							delayMs < 0 ||
							delayMs > 10_000
						)
							throw new RangeError(
								"delayMs must be an integer from 0 to 10000.",
							);
						if (pausedReports.has(traceId))
							throw new TypeError(
								"A report with this traceId is already paused.",
							);
						const handlerEntries = ++entry.handlerEntries;
						recorder.mark(traceId, "handler-entered", { handlerEntries });
						const aborted = () =>
							recorder.mark(traceId, "handler-signal-aborted");
						signal.addEventListener("abort", aborted, { once: true });
						try {
							if (pause) {
								recorder.mark(traceId, "handler-paused");
								// This application pause deliberately survives cancellation to demonstrate late settlement.
								await new Promise<void>((resolve) =>
									pausedReports.set(traceId, {
										peerId: entry.id,
										signal,
										resume: resolve,
									}),
								);
							}
							await setTimeout(delayMs);
							return {
								traceId,
								rows: 42,
								handlerEntries,
								aborted: signal.aborted,
							};
						} finally {
							signal.removeEventListener("abort", aborted);
						}
					}),
				resume,
				setGlobalExposure(enabled) {
					validateBoolean(enabled);
					if (enabled)
						globalCleanup ??= acceptor.expose(
							REMOTE_SHIPPING_SERVICE,
							shipping,
						);
					else {
						globalCleanup?.();
						globalCleanup = undefined;
					}
					return enabled;
				},
				setPeerExposure: (peerId, enabled) =>
					setPeerExposure(findPeer(peerId), enabled),
				conflict() {
					// A temporary owner exposure keeps this demonstration valid even after global revoke.
					const temporaryCleanup = globalCleanup
						? undefined
						: acceptor.expose(REMOTE_SHIPPING_SERVICE, shipping);
					try {
						peer.expose(REMOTE_SHIPPING_SERVICE, shipping)();
						throw new Error("Expected the duplicate wire name to be rejected.");
					} catch (error) {
						if (error instanceof TypeError)
							return "TypeError: duplicate global and peer-local wire name rejected";
						throw error;
					} finally {
						temporaryCleanup?.();
					}
				},
				callback,
				async fanout(message) {
					// Application policy: call connected peers concurrently and retain every independent result.
					const targets = [...peers.values()].filter(
						(entry) => entry.peer.state.status === RpcStateStatusEnum.connected,
					);
					const results = await Promise.allSettled(
						targets.map((entry) => callback(entry.id, message)),
					);
					return results.map((result, index) => ({
						peerId: targets[index].id,
						outcome:
							result.status === "fulfilled"
								? RpcCallStatusEnum.fulfilled
								: RpcCallStatusEnum.rejected,
						result:
							result.status === "fulfilled"
								? result.value
								: result.reason instanceof RpcException
									? result.reason.code
									: RpcExceptionCodeEnum.handlerFailed,
					}));
				},
			};
			peer.expose(REMOTE_LAB_SERVICE, service);
		},
		closePeer(peer) {
			const entry = peers.get(peer);
			if (!entry) return;
			for (const [traceId, paused] of pausedReports)
				if (paused.peerId === entry.id) resume(traceId);
			entry.cleanup?.();
			peers.delete(peer);
		},
		peerId: (peer) => peers.get(peer)?.id,
		snapshot: () => ({
			instanceId,
			peers: [...peers.values()].map((entry) => ({
				id: entry.id,
				status: entry.peer.state.status,
				peerExposure: entry.cleanup !== undefined,
				handlerEntries: entry.handlerEntries,
			})),
			globalExposure: globalCleanup !== undefined,
			pausedReports: [...pausedReports].map(([traceId, paused]) => ({
				traceId,
				peerId: paused.peerId,
				aborted: paused.signal.aborted,
			})),
			recording: recorder.snapshot(),
		}),
		resumeAll() {
			for (const traceId of pausedReports.keys()) resume(traceId);
		},
	};
}

type PeerEntry = {
	readonly peer: IRpcPeer;
	readonly id: string;
	handlerEntries: number;
	cleanup: (() => void) | undefined;
};

type PausedReport = {
	readonly peerId: string;
	readonly signal: AbortSignal;
	readonly resume: () => void;
};

function quote(from: string, to: string, kg: number): ShippingQuote {
	validateText(from, "from", 80);
	validateText(to, "to", 80);
	if (typeof kg !== "number" || !Number.isFinite(kg) || kg <= 0 || kg > 100)
		throw new RangeError("kg must be greater than 0 and no greater than 100.");
	return {
		from: from.trim(),
		to: to.trim(),
		kg,
		amount: Math.round((12 + kg * 4) * 100) / 100,
		currency: "CNY",
	};
}

function validateText(value: string, name: string, maxLength: number): void {
	if (
		typeof value !== "string" ||
		value.trim().length === 0 ||
		value.length > maxLength
	)
		throw new TypeError(`${name} must contain 1 to ${maxLength} characters.`);
}

function validateBoolean(value: boolean): void {
	if (typeof value !== "boolean") throw new TypeError("Expected a boolean.");
}
