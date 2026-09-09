/**
 * @overview Shared protocol fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Subject } from "rxjs";
import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
	IRpcConnectorAdapter,
} from "../../../src/index";

export const ICalculatorService =
	createServiceIdentifier<CalculatorService>("ICalculatorService");

export const IDeferredCalculatorService =
	createServiceIdentifier<DeferredCalculatorService>(
		"IDeferredCalculatorService",
	);

export function collectPublicErrorText(error: unknown): string {
	const cause =
		error instanceof Error && "cause" in error ? error.cause : undefined;
	return [
		String(error),
		error instanceof Error ? error.stack : undefined,
		String(cause),
		cause instanceof Error ? cause.stack : undefined,
	].join("\n");
}

export function createMemoryAdapters(
	transform?: (
		direction: "connector" | "acceptor",
		message: Uint8Array,
	) => Uint8Array,
): {
	readonly connectorAdapter: IRpcConnectorAdapter;
	readonly acceptorAdapter: IRpcAcceptorAdapter;
	readonly records: CapturedRecord[];
	readonly maximumConcurrentSends: Readonly<
		Record<"connector" | "acceptor", number>
	>;
} {
	const connectorConnections = new Subject<IRpcConnection>();
	const acceptorConnections = new Subject<IRpcConnection>();
	const connectorIngress = new Subject<Uint8Array>();
	const acceptorIngress = new Subject<Uint8Array>();
	const records: CapturedRecord[] = [];
	const concurrentSends = { connector: 0, acceptor: 0 };
	const maximumConcurrentSends = { connector: 0, acceptor: 0 };
	const decoder = new TextDecoder();

	const createConnection = (
		direction: "connector" | "acceptor",
		messageSource: Subject<Uint8Array>,
		peerSource: Subject<Uint8Array>,
	): IRpcConnection => ({
		message$: messageSource.asObservable(),
		async send(message) {
			concurrentSends[direction] += 1;
			maximumConcurrentSends[direction] = Math.max(
				maximumConcurrentSends[direction],
				concurrentSends[direction],
			);
			if (concurrentSends[direction] !== 1) {
				throw new Error(`${direction} started overlapping sends.`);
			}
			try {
				const snapshot = message.slice();
				records.push({
					direction,
					value: JSON.parse(decoder.decode(snapshot)) as Readonly<
						Record<string, unknown>
					>,
				});
				await Promise.resolve();
				peerSource.next(transform?.(direction, snapshot) ?? snapshot);
			} finally {
				concurrentSends[direction] -= 1;
			}
		},
		async close() {
			messageSource.complete();
			peerSource.complete();
		},
	});

	const connectorConnection = createConnection(
		"connector",
		connectorIngress,
		acceptorIngress,
	);
	const acceptorConnection = createConnection(
		"acceptor",
		acceptorIngress,
		connectorIngress,
	);

	return {
		connectorAdapter: {
			connection$: connectorConnections.asObservable(),
			async connect() {
				connectorConnections.next(connectorConnection);
				acceptorConnections.next(acceptorConnection);
				connectorConnections.complete();
			},
		},
		acceptorAdapter: {
			connection$: acceptorConnections.asObservable(),
			async listen() {},
		},
		records,
		maximumConcurrentSends,
	};
}

export function createRecoveryNetwork(): {
	readonly acceptorAdapter: IRpcAcceptorAdapter;
	readonly records: RecoveryCapturedRecord[];
	createConnectorAdapter(
		fault?: (
			record: RecoveryCapturedRecord,
			message: Uint8Array,
		) => RecoverySendFault,
		closeBehavior?: "propagate" | "silent",
	): IRpcConnectorAdapter;
	openRawConnection(): RawRecoveryConnection;
	disconnect(connectionId: number): void;
	disconnectSide(connectionId: number, side: "connector" | "acceptor"): void;
	emit(
		connectionId: number,
		target: "connector" | "acceptor",
		record: Readonly<Record<string, unknown>>,
	): void;
	directCloseCount(connectionId: number): number;
} {
	const acceptorConnections = new Subject<IRpcConnection>();
	const links = new Map<number, RecoveryLink>();
	const directCloseCounts = new Map<number, number>();
	const records: RecoveryCapturedRecord[] = [];
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let nextConnectionId = 0;

	return {
		acceptorAdapter: {
			connection$: acceptorConnections.asObservable(),
			async listen() {},
		},
		records,
		createConnectorAdapter(fault, closeBehavior = "propagate") {
			const connectorConnections = new Subject<IRpcConnection>();
			return {
				connection$: connectorConnections.asObservable(),
				async connect() {
					nextConnectionId += 1;
					const connectionId = nextConnectionId;
					const connectorIngress = new Subject<Uint8Array>();
					const acceptorIngress = new Subject<Uint8Array>();
					links.set(connectionId, { connectorIngress, acceptorIngress });
					let closed = false;
					const close = async (): Promise<void> => {
						if (closed) {
							return;
						}
						closed = true;
						directCloseCounts.set(
							connectionId,
							(directCloseCounts.get(connectionId) ?? 0) + 1,
						);
						if (closeBehavior === "propagate") {
							connectorIngress.complete();
							acceptorIngress.complete();
						}
					};
					const createConnection = (
						direction: "connector" | "acceptor",
						messageSource: Subject<Uint8Array>,
						peerSource: Subject<Uint8Array>,
					): IRpcConnection => ({
						message$: messageSource.asObservable(),
						async send(message) {
							const snapshot = message.slice();
							const record: RecoveryCapturedRecord = {
								connectionId,
								direction,
								value: JSON.parse(decoder.decode(snapshot)) as Readonly<
									Record<string, unknown>
								>,
							};
							records.push(record);
							const selected = fault?.(record, snapshot);
							await Promise.resolve();
							if (selected?.drop !== true) {
								peerSource.next(selected?.message ?? snapshot);
							}
							if (selected?.peerError !== undefined) {
								peerSource.error(selected.peerError);
							}
							await selected?.settlement;
							if (selected?.error !== undefined) {
								throw selected.error;
							}
						},
						close,
					});
					connectorConnections.next(
						createConnection("connector", connectorIngress, acceptorIngress),
					);
					acceptorConnections.next(
						createConnection("acceptor", acceptorIngress, connectorIngress),
					);
					connectorConnections.complete();
				},
			};
		},
		openRawConnection() {
			nextConnectionId += 1;
			const connectionId = nextConnectionId;
			const ingress = new Subject<Uint8Array>();
			const responses: Readonly<Record<string, unknown>>[] = [];
			let closed = false;
			acceptorConnections.next({
				message$: ingress.asObservable(),
				async send(message) {
					const snapshot = message.slice();
					const value = JSON.parse(decoder.decode(snapshot)) as Readonly<
						Record<string, unknown>
					>;
					records.push({ connectionId, direction: "acceptor", value });
					responses.push(value);
				},
				async close() {
					if (!closed) {
						closed = true;
						ingress.complete();
					}
				},
			});
			return {
				connectionId,
				responses,
				send(record) {
					const message = new TextEncoder().encode(JSON.stringify(record));
					records.push({
						connectionId,
						direction: "connector",
						value: record,
					});
					ingress.next(message);
				},
			};
		},
		disconnect(connectionId) {
			const link = links.get(connectionId);
			link?.connectorIngress.complete();
			link?.acceptorIngress.complete();
		},
		disconnectSide(connectionId, side) {
			const link = links.get(connectionId);
			if (side === "connector") {
				link?.connectorIngress.complete();
			} else {
				link?.acceptorIngress.complete();
			}
		},
		emit(connectionId, target, record) {
			const link = links.get(connectionId);
			const message = encoder.encode(JSON.stringify(record));
			if (target === "connector") {
				link?.connectorIngress.next(message);
			} else {
				link?.acceptorIngress.next(message);
			}
		},
		directCloseCount(connectionId) {
			return directCloseCounts.get(connectionId) ?? 0;
		},
	};
}

interface CalculatorService {
	add(left: number, right: number): number;
}

interface DeferredCalculatorService {
	add(left: number, right: number): Promise<number>;
}

interface CapturedRecord {
	readonly direction: "connector" | "acceptor";
	readonly value: Readonly<Record<string, unknown>>;
}

interface RecoveryCapturedRecord extends CapturedRecord {
	readonly connectionId: number;
}

interface RecoverySendFault {
	readonly drop?: boolean;
	readonly error?: Error;
	readonly message?: Uint8Array;
	readonly peerError?: Error;
	readonly settlement?: Promise<void>;
}

interface RecoveryLink {
	readonly connectorIngress: Subject<Uint8Array>;
	readonly acceptorIngress: Subject<Uint8Array>;
}

interface RawRecoveryConnection {
	readonly connectionId: number;
	readonly responses: Readonly<Record<string, unknown>>[];
	send(record: Readonly<Record<string, unknown>>): void;
}
