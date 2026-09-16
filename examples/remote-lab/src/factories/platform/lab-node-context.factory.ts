/**
 * @overview Creates the same observable resource context inside real Node and Chromium nodes.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type { IRpcConnection } from "@husky-di/remote";
import { map, share, tap } from "rxjs";
import { LabTransportDirectionEnum } from "@/enums/lab-recording.enum";
import type { ILabNodeContext } from "@/interfaces/platform/lab-case.interface";
import { projectLabState } from "@/utils/project-lab-state.util";

export type CreateLabNodeContextOptions = {
	readonly parameters: Readonly<Record<string, unknown>>;
	readonly emit: (record: unknown) => void;
	readonly nodeId?: string;
};

export function createLabNodeContext({
	parameters,
	emit,
	nodeId = "local",
}: CreateLabNodeContextOptions) {
	const controller = new AbortController();
	const cleanups = new Set<() => void | Promise<void>>();
	const observations = new Set<() => void>();
	const owners = new WeakMap<object, string>();
	const peers = new WeakMap<object, string>();
	const adapters = new WeakMap<object, string>();
	const connectionIds = new WeakMap<object, string>();
	const connections = new WeakMap<IRpcConnection, IRpcConnection>();
	let nextIdentity = 0;
	const identify = (
		identities: WeakMap<object, string>,
		value: object,
		kind: string,
	) => {
		let identity = identities.get(value);
		if (!identity) {
			identity = `${nodeId}:${kind}-${++nextIdentity}`;
			identities.set(value, identity);
		}
		return identity;
	};
	let closing: Promise<void> | undefined;
	const own: ILabNodeContext["own"] = (cleanup) => {
		cleanups.add(cleanup);
		return () => {
			cleanups.delete(cleanup);
		};
	};
	const context: ILabNodeContext = {
		signal: controller.signal,
		parameters,
		own,
		log: (message, data) => emit({ kind: "log", message, data }),
		observe(owner, name = "remote") {
			const ownerId = identify(owners, owner, "owner");
			const observerId = `${nodeId}:observer-${++nextIdentity}`;
			emit({
				kind: "owner",
				nodeId,
				observerId,
				ownerId,
				name,
				state: observeState(owner.state),
			});
			const subscription = owner.event$.subscribe((event) => {
				const value = event as Record<string, unknown>;
				const { peer, ...rest } = value;
				const observedPeer =
					typeof peer === "object" && peer !== null ? peer : undefined;
				emit({
					kind: "rpc",
					nodeId,
					observerId,
					ownerId,
					name,
					event: Object.fromEntries(
						Object.entries(rest).filter(
							([_key, value]) =>
								value === null ||
								["string", "number", "boolean"].includes(typeof value),
						),
					),
					...(observedPeer
						? {
								peerId: identify(peers, observedPeer, "peer"),
								peerState: observeState(
									(observedPeer as { state?: unknown }).state,
								),
							}
						: {}),
					state: observeState(owner.state),
				});
			});
			const dispose = () => subscription.unsubscribe();
			observations.add(dispose);
			return dispose;
		},
		transport(adapter) {
			const observerId = identify(adapters, adapter, "adapter");
			const connection$ = adapter.connection$.pipe(
				map((connection) => {
					const existing = connections.get(connection);
					if (existing) return existing;
					const connectionId = identify(
						connectionIds,
						connection,
						"connection",
					);
					const snapshot = (bytes: Uint8Array) => {
						const detached = Uint8Array.from(bytes);
						let payload: string | undefined;
						let message: unknown;
						try {
							payload = new TextDecoder("utf-8", {
								fatal: true,
								ignoreBOM: true,
							}).decode(detached);
							message = JSON.parse(payload);
						} catch {
							message = Array.from(detached);
						}
						return {
							kind: "wire",
							nodeId,
							observerId,
							connectionId,
							bytes: detached.byteLength,
							payload,
							message,
						};
					};
					const observed: IRpcConnection = {
						message$: connection.message$.pipe(
							tap((bytes) =>
								emit({
									...snapshot(bytes),
									direction: LabTransportDirectionEnum.received,
									outcome: "received",
								}),
							),
							share({
								resetOnError: false,
								resetOnComplete: false,
								resetOnRefCountZero: false,
							}),
						),
						async send(bytes) {
							const record = snapshot(bytes);
							try {
								await connection.send(bytes);
							} catch (error) {
								try {
									emit({
										...record,
										direction: LabTransportDirectionEnum.sent,
										outcome: "failed",
									});
								} catch {
									// Recording failure cannot replace the transport's original rejection.
								}
								throw error;
							}
							emit({
								...record,
								direction: LabTransportDirectionEnum.sent,
								outcome: "locally-admitted",
							});
						},
						close: () => connection.close(),
					};
					connections.set(connection, observed);
					return observed;
				}),
			);
			return {
				connection$,
				...("connect" in adapter
					? { connect: (signal: AbortSignal) => adapter.connect(signal) }
					: { listen: (signal: AbortSignal) => adapter.listen(signal) }),
			} as typeof adapter;
		},
	};
	return {
		context,
		close() {
			closing ??= (async () => {
				controller.abort(new Error("Lab node stopped."));
				const errors: unknown[] = [];
				for (const cleanup of [...cleanups].reverse()) {
					try {
						await cleanup();
					} catch (error) {
						errors.push(error);
					}
				}
				cleanups.clear();
				for (const dispose of observations) dispose();
				observations.clear();
				if (errors.length)
					throw new AggregateError(errors, "Lab node cleanup failed.");
			})();
			return closing;
		},
	};
}

function observeState(state: unknown) {
	if (
		typeof state !== "object" ||
		state === null ||
		!("status" in state) ||
		typeof state.status !== "string"
	)
		return undefined;
	return projectLabState(state as { status: string });
}
