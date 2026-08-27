/**
 * @overview Private RPC Topology Owner resource custody and final cleanup barrier.
 * @author AEPKILL
 * @created 2026-08-22 15:32:32
 */

import type { Subscription } from "rxjs";
import type {
	IRpcOwnerCustody,
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/interfaces/owner/rpc-owner-custody.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

const cleanupDeadline = Symbol("RPC Owner cleanup deadline");

type RpcOwnerCleanupSettlement = Error | undefined | typeof cleanupDeadline;

/** Owns a Topology Owner's Connections and cleanup barrier. */
export class RpcOwnerCustodyImpl implements IRpcOwnerCustody {
	readonly #cleanupDeadlineMs: number;
	readonly #cleanupProtocol: () => unknown;
	readonly #cleanups: RpcOwnedCleanup[] = [];
	readonly #connectionCapabilities = new WeakMap<
		IRpcConnection,
		RpcOwnedConnection
	>();
	readonly #connectionSubscriptions = new Map<
		RpcOwnedConnection,
		Subscription | undefined
	>();
	#finishing = false;
	#finishTask: Promise<void> | undefined;

	constructor(cleanupDeadlineMs: number, cleanupProtocol: () => unknown) {
		this.#cleanupDeadlineMs = cleanupDeadlineMs;
		this.#cleanupProtocol = cleanupProtocol;
	}

	get connectionCount(): number {
		return this.#connectionSubscriptions.size;
	}

	ownConnection(connection: IRpcConnection): RpcOwnedConnection {
		const retained = this.#connectionCapabilities.get(connection);
		if (retained !== undefined) {
			return retained;
		}

		const cleanup = this.ownCleanup(() => connection.close());
		let observingClose = false;
		const capability = Object.freeze<RpcOwnedConnection>({
			connection,
			directClose: () => {
				const task = cleanup.start();
				if (!observingClose) {
					observingClose = true;
					void task.then(
						() => this.#releaseConnection(capability),
						() => {},
					);
				}
				return task;
			},
		});
		this.#connectionCapabilities.set(connection, capability);
		this.#connectionSubscriptions.set(capability, undefined);
		const subscription = connection.message$.subscribe({
			error: () => capability.directClose(),
			complete: () => capability.directClose(),
		});
		this.#connectionSubscriptions.set(capability, subscription);
		return capability;
	}

	ownCleanup(cleanup: () => unknown): RpcOwnedCleanup {
		let task: Promise<void> | undefined;
		const capability = Object.freeze<RpcOwnedCleanup>({
			start: () => {
				if (task !== undefined) {
					return task;
				}
				const {
					promise,
					resolve: resolveCleanup,
					reject: rejectCleanup,
				} = Promise.withResolvers<void>();
				task = promise;
				try {
					Promise.resolve(cleanup()).then(
						() => resolveCleanup(),
						rejectCleanup,
					);
				} catch (error) {
					rejectCleanup(error);
				}
				void task.catch(() => {});
				void task.then(
					() => {
						if (!this.#finishing) {
							this.#releaseCleanup(capability);
						}
					},
					() => {},
				);
				return task;
			},
		});
		this.#cleanups.push(capability);
		return capability;
	}

	finishCleanup(): Promise<void> {
		if (this.#finishTask !== undefined) {
			return this.#finishTask;
		}
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		this.#finishTask = promise;
		this.#finishing = true;
		this.ownCleanup(this.#cleanupProtocol);

		let timer: ReturnType<typeof setTimeout>;
		const deadline = new Promise<typeof cleanupDeadline>((resolveDeadline) => {
			timer = setTimeout(
				() => resolveDeadline(cleanupDeadline),
				this.#cleanupDeadlineMs,
			);
		});
		const settlements = this.#cleanups.map((cleanup) =>
			Promise.race<RpcOwnerCleanupSettlement>([
				cleanup
					.start()
					.then<RpcOwnerCleanupSettlement, RpcOwnerCleanupSettlement>(
						() => undefined,
						(value: unknown) =>
							value instanceof Error
								? value
								: new Error("RPC Owner cleanup failed."),
					),
				deadline,
			]),
		);
		void Promise.all(settlements).then((results) => {
			clearTimeout(timer);
			const errors = results.filter(
				(result): result is Error => result instanceof Error,
			);
			if (results.includes(cleanupDeadline)) {
				errors.push(new Error("RPC Owner cleanup exceeded its deadline."));
			}
			this.#detach();
			if (errors.length === 0) {
				resolve();
			} else if (errors.length === 1) {
				reject(errors[0]);
			} else {
				reject(new AggregateError(errors, "RPC Owner cleanup failed."));
			}
		});
		return promise;
	}

	#releaseCleanup(cleanup: RpcOwnedCleanup): void {
		const index = this.#cleanups.indexOf(cleanup);
		if (index >= 0) {
			this.#cleanups.splice(index, 1);
		}
	}

	#releaseConnection(connection: RpcOwnedConnection): void {
		try {
			this.#connectionSubscriptions.get(connection)?.unsubscribe();
		} catch {
			// The Connection cleanup has already settled successfully.
		}
		this.#connectionSubscriptions.delete(connection);
	}

	#detach(): void {
		for (const subscription of this.#connectionSubscriptions.values()) {
			try {
				subscription?.unsubscribe();
			} catch {
				// Final cleanup has already selected its authoritative outcome.
			}
		}
		this.#connectionSubscriptions.clear();
		this.#cleanups.splice(0);
	}
}
