/**
 * @overview Shared conformance/test.utils.ts fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Subject } from "rxjs";
import type {
	IRpcAcceptorAdapterConformanceFixture,
	IRpcAdapterConformanceRemote,
	IRpcConnectorAdapterConformanceFixture,
} from "../../../src/conformance";
import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
	IRpcConnectorAdapter,
} from "../../../src/modules/transport";

export function createMemoryConnectorFixture(): IRpcConnectorAdapterConformanceFixture {
	return {
		async create() {
			const connectionSource = new Subject<IRpcConnection>();
			const started = Promise.withResolvers<void>();
			const startup = Promise.withResolvers<void>();
			let used = false;
			let handedOff = false;
			let terminal = false;
			let signal: AbortSignal | undefined;
			let abortListener: (() => void) | undefined;

			const adapter: IRpcConnectorAdapter = {
				connection$: connectionSource.asObservable(),
				connect(nextSignal) {
					if (used) {
						return Promise.reject(
							new Error("Connector Adapter is single-use."),
						);
					}
					used = true;
					signal = nextSignal;
					abortListener = () => {
						if (handedOff || terminal) {
							return;
						}
						terminal = true;
						connectionSource.complete();
						startup.reject(
							new DOMException("Connection aborted.", "AbortError"),
						);
					};
					nextSignal.addEventListener("abort", abortListener, { once: true });
					started.resolve(undefined);
					if (nextSignal.aborted) {
						abortListener();
					}
					return startup.promise;
				},
			};

			return {
				adapter,
				async handoff(firstMessage) {
					await started.promise;
					if (terminal) {
						throw new Error("Connector startup is terminal.");
					}
					const pair = createConnectionPair();
					connectionSource.next(pair.connection);
					handedOff = true;
					if (firstMessage !== undefined) {
						await pair.remote.sendToAdapter(firstMessage);
					}
					terminal = true;
					connectionSource.complete();
					startup.resolve(undefined);
					return pair.remote;
				},
				async failStartup(error) {
					await started.promise;
					terminal = true;
					connectionSource.error(error);
					startup.reject(error);
				},
				async cleanup() {
					if (signal !== undefined && abortListener !== undefined) {
						signal.removeEventListener("abort", abortListener);
					}
				},
			};
		},
	};
}

export function createMemoryAcceptorFixture(): IRpcAcceptorAdapterConformanceFixture {
	return {
		async create() {
			const connectionSource = new Subject<IRpcConnection>();
			const started = Promise.withResolvers<void>();
			const startup = Promise.withResolvers<void>();
			let used = false;
			let ready = false;
			let terminal = false;
			let signal: AbortSignal | undefined;
			let abortListener: (() => void) | undefined;

			const adapter: IRpcAcceptorAdapter = {
				connection$: connectionSource.asObservable(),
				listen(nextSignal) {
					if (used) {
						return Promise.reject(new Error("Acceptor Adapter is single-use."));
					}
					used = true;
					signal = nextSignal;
					abortListener = () => {
						if (terminal) {
							return;
						}
						terminal = true;
						connectionSource.complete();
						if (!ready) {
							startup.reject(
								new DOMException("Listener aborted.", "AbortError"),
							);
						}
					};
					nextSignal.addEventListener("abort", abortListener, { once: true });
					started.resolve(undefined);
					if (nextSignal.aborted) {
						abortListener();
					}
					return startup.promise;
				},
			};

			return {
				adapter,
				async accept(firstMessage) {
					await started.promise;
					const pair = createConnectionPair();
					connectionSource.next(pair.connection);
					if (firstMessage !== undefined) {
						await pair.remote.sendToAdapter(firstMessage);
					}
					return pair.remote;
				},
				async markReady() {
					await started.promise;
					ready = true;
					startup.resolve(undefined);
				},
				async completeListener() {
					terminal = true;
					connectionSource.complete();
					if (!ready) {
						startup.reject(new Error("Listener completed before ready."));
					}
				},
				async failListener(error) {
					await started.promise;
					terminal = true;
					connectionSource.error(error);
					if (!ready) {
						startup.reject(error);
					}
				},
				async cleanup() {
					if (signal !== undefined && abortListener !== undefined) {
						signal.removeEventListener("abort", abortListener);
					}
				},
			};
		},
	};
}

interface PendingSend {
	readonly message: Uint8Array;
	readonly deferred: PromiseWithResolvers<void>;
}

interface ConnectionPair {
	readonly connection: IRpcConnection;
	readonly remote: IRpcAdapterConformanceRemote;
}

function createConnectionPair(): ConnectionPair {
	const messageSource = new Subject<Uint8Array>();
	const adapterClosed = Promise.withResolvers<void>();
	const outbound: Uint8Array[] = [];
	const outboundWaiters: PromiseWithResolvers<Uint8Array>[] = [];
	let blocked = false;
	let pendingSend: PendingSend | undefined;
	let closed = false;
	let closeTask: Promise<void> | undefined;

	const admit = (message: Uint8Array): void => {
		const snapshot = message.slice();
		const waiter = outboundWaiters.shift();
		if (waiter === undefined) {
			outbound.push(snapshot);
		} else {
			waiter.resolve(snapshot);
		}
	};

	const connection: IRpcConnection = {
		message$: messageSource.asObservable(),
		send(message) {
			if (closed) {
				return Promise.reject(new Error("Connection is closed."));
			}
			if (!blocked) {
				admit(message);
				return Promise.resolve();
			}
			if (pendingSend !== undefined) {
				return Promise.reject(new Error("Only one send may be unsettled."));
			}
			const deferred = Promise.withResolvers<void>();
			pendingSend = { message, deferred };
			return deferred.promise;
		},
		close() {
			closed = true;
			if (closeTask === undefined) {
				pendingSend?.deferred.reject(
					new Error("Connection closed during send."),
				);
				pendingSend = undefined;
				messageSource.complete();
				adapterClosed.resolve(undefined);
				closeTask = Promise.resolve();
			}
			return closeTask;
		},
	};

	const remote: IRpcAdapterConformanceRemote = {
		async sendToAdapter(message) {
			if (closed) {
				throw new Error("Connection is closed.");
			}
			messageSource.next(message);
		},
		async receiveFromAdapter() {
			const message = outbound.shift();
			if (message !== undefined) {
				return message;
			}
			const waiter = Promise.withResolvers<Uint8Array>();
			outboundWaiters.push(waiter);
			return waiter.promise;
		},
		async setAdapterSendBlocked(nextBlocked) {
			blocked = nextBlocked;
			if (!blocked && pendingSend !== undefined) {
				const pending = pendingSend;
				pendingSend = undefined;
				admit(pending.message);
				pending.deferred.resolve(undefined);
			}
		},
		async closeFromRemote() {
			messageSource.complete();
		},
		async failFromRemote(error) {
			closed = true;
			pendingSend?.deferred.reject(error);
			pendingSend = undefined;
			messageSource.error(error);
			adapterClosed.resolve(undefined);
		},
		isAdapterClosed: () => closed,
		waitForAdapterClose: () => adapterClosed.promise,
	};

	return { connection, remote };
}
