/**
 * @overview Hosts the built-in Remote service in an execution-owned Node subprocess.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { createServer } from "node:http";
import {
	createRpcAcceptor,
	type IRpcAcceptor,
	type IRpcPeer,
	RpcEventTypeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { createNodeWebSocketAcceptorAdapter } from "@husky-di/remote-websocket/node";
import type { ILabNodeContext } from "@husky-di/example-remote-lab/sdk";
import { Observable, Subject } from "rxjs";
import {
	CALLBACK,
	POLICY,
	SERVICE,
	SHIPPING,
	INSPECTION,
	type IService,
} from "./descriptors";

export async function labNode(context: ILabNodeContext) {
	acceptor = createRpcAcceptor({
		runtimePolicy: {
			...POLICY,
			...(typeof context.parameters.maxSessions === "number"
				? { maxSessions: context.parameters.maxSessions }
				: {}),
		},
	});
	const server = createServer();
	context.own(
		() =>
			new Promise<void>((resolve, reject) => {
				server.closeAllConnections();
				if (!server.listening) return resolve();
				server.close((error) => (error ? reject(error) : resolve()));
			}),
	);
	context.own(() => acceptor.close());
	context.observe(acceptor, "server");
	const peerEvents = acceptor.event$.subscribe((event) => {
		if (event.type === RpcEventTypeEnum.peerOpened) {
			const id = `peer-${++nextPeerId}`;
			peerEntries.set(event.peer, {
				id,
				cleanup: event.peer.expose(INSPECTION, { inspect: () => id }),
			});
		}
	});
	context.own(() => peerEvents.unsubscribe());
	context.own(() => {
		for (const entry of held.values()) entry.resume();
	});
	implementation = {
		echo: (value) => {
			echoEntries++;
			return value;
		},
		fail: () => {
			throw new Error(
				"Built-in service failure must become a safe handler-failed result.",
			);
		},
		held(key, signal) {
			if (held.has(key))
				throw new TypeError("A report with this key is already paused");
			heldEntries++;
			return new Promise<void>((resolve) =>
				held.set(key, { signal, resume: resolve }),
			).then(() => {
				const result = { aborted: signal.aborted };
				heldResults.set(key, result);
				context.log("held handler settled", { key, ...result });
				return result;
			});
		},
		resume: resumeHeld,
		changes: new Observable<number>((subscriber) => {
			staticSubscriptions++;
			const subscription = staticValues.subscribe(subscriber);
			return () => {
				staticTeardowns++;
				subscription.unsubscribe();
			};
		}),
		delayed(ms, signal) {
			if (!Number.isInteger(ms) || ms < 0 || ms > 10000)
				throw new RangeError("Delay must be an integer from 0 to 10000");
			entries++;
			context.log("handler entered", { entries });
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					signal.removeEventListener("abort", abort);
					resolve({ entries, aborted: signal.aborted });
				}, ms);
				function abort() {
					clearTimeout(timer);
					canceled++;
					reject(new Error("handler canceled"));
				}
				signal.addEventListener("abort", abort, { once: true });
			});
		},
		async callback(index, message) {
			const peer = acceptor.peers[index];
			if (!peer) throw new Error(`No peer ${index}.`);
			return peer.resolve(CALLBACK).receive(message);
		},
		values(count) {
			return new Observable<number>((subscriber) => {
				let value = 0;
				const timer = setInterval(() => {
					subscriber.next(value++);
					if (value >= count) subscriber.complete();
				}, 20);
				return () => {
					clearInterval(timer);
					streamTeardowns++;
					context.log("stream teardown", { streamTeardowns });
				};
			});
		},
	};
	setExposure(true);
	setShippingExposure(true);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	await acceptor.listen(
		context.transport(
			createNodeWebSocketAcceptorAdapter({ server, path: "/rpc" }),
		),
	);
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing built-in listener address.");
	return { endpoint: `ws://127.0.0.1:${address.port}/rpc`, pid: process.pid };
}

export function metrics() {
	return {
		entries,
		echoEntries,
		heldEntries,
		staticSubscriptions,
		staticTeardowns,
		canceled,
		streamTeardowns,
		peers: acceptor.peers.length,
		state: acceptor.state,
	};
}
export function setExposure(enabled: boolean) {
	dispose?.();
	dispose = undefined;
	if (enabled) dispose = acceptor.expose(SERVICE, implementation);
	return enabled;
}

export function quote(from: string, to: string, kg: number) {
	for (const text of [from, to])
		if (typeof text !== "string" || !text.trim() || text.length > 80)
			throw new TypeError(
				"Shipping locations require 1 to 80 nonblank characters",
			);
	if (typeof kg !== "number" || !Number.isFinite(kg) || kg <= 0 || kg > 100)
		throw new RangeError(
			"Shipping kilograms must be greater than zero and at most 100",
		);
	return {
		from: from.trim(),
		to: to.trim(),
		kg,
		amount: Math.round((12 + 4 * kg) * 100) / 100,
		currency: "CNY",
	};
}
export function setShippingExposure(enabled: boolean) {
	shippingCleanup?.();
	shippingCleanup = undefined;
	if (enabled) shippingCleanup = acceptor.expose(SHIPPING, { quote });
}
export function setPeerExposure(index: number, enabled: boolean) {
	const peer = acceptor.peers[index];
	const entry = peerEntries.get(peer);
	if (!entry) throw new Error(`No peer ${index}`);
	entry.cleanup?.();
	entry.cleanup = undefined;
	if (enabled)
		entry.cleanup = peer.expose(INSPECTION, { inspect: () => entry.id });
	return entry.id;
}
export function exposureConflict() {
	try {
		acceptor.peers[0].expose(SHIPPING, { quote })();
	} catch (error) {
		if (error instanceof TypeError) return "TypeError";
		throw error;
	}
	throw new Error("Remote allowed a conflicting global/per-Peer wire name");
}
export async function fanout(message: string) {
	const targets = acceptor.peers.filter(
		(peer) => peer.state.status === RpcStateStatusEnum.connected,
	);
	const results = await Promise.allSettled(
		targets.map((peer) => peer.resolve(CALLBACK).receive(message)),
	);
	return results.map((result, index) => ({
		peerId: peerEntries.get(targets[index])?.id,
		outcome: result.status,
		result:
			result.status === "fulfilled"
				? result.value
				: (result.reason as { code?: string }).code,
	}));
}
export function resumeHeld(key: string) {
	const report = held.get(key);
	if (!report) return false;
	held.delete(key);
	report.resume();
	return true;
}
export function heldStatus(key: string) {
	return {
		pending: held.has(key),
		aborted: held.get(key)?.signal.aborted ?? false,
		result: heldResults.get(key) ?? null,
	};
}
export function emitStatic(value: number) {
	staticValues.next(value);
}

const peerEntries = new Map<
	IRpcPeer,
	{ id: string; cleanup: (() => void) | undefined }
>();
const held = new Map<string, { signal: AbortSignal; resume(): void }>();
const heldResults = new Map<string, { aborted: boolean }>();
const staticValues = new Subject<number>();
let nextPeerId = 0;
let shippingCleanup: (() => void) | undefined;
let echoEntries = 0;
let heldEntries = 0;
let staticSubscriptions = 0;
let staticTeardowns = 0;

let acceptor: IRpcAcceptor;
let implementation: IService;
let dispose: (() => void) | undefined;
let entries = 0;
let canceled = 0;
let streamTeardowns = 0;
