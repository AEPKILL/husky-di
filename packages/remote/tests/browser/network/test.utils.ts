/**
 * @overview Shared browser in-memory transport, wire recording, and bounded polling.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03
 */

import { Subject } from "rxjs";
import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
	IRpcConnectorAdapter,
} from "../../../src/index";

export interface IBrowserWireRecord {
	readonly connectionIndex: number;
	readonly origin: "acceptor" | "connector";
	readonly record: Readonly<Record<string, unknown>>;
}

export function createBrowserMemoryNetwork(v1Only = false): {
	readonly acceptorAdapter: IRpcAcceptorAdapter;
	readonly records: readonly IBrowserWireRecord[];
	createConnectorAdapter(): IRpcConnectorAdapter;
	disconnect(connectionIndex: number): void;
} {
	const acceptorConnections = new Subject<IRpcConnection>();
	const decoder = new TextDecoder();
	const links: IBrowserMemoryLink[] = [];
	const records: IBrowserWireRecord[] = [];

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
					const connectionIndex = links.length;
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
						origin: IBrowserWireRecord["origin"],
					): IRpcConnection => ({
						message$: messageSource.asObservable(),
						async send(message) {
							if (closed) {
								throw new Error("Browser test Connection is closed.");
							}
							let snapshot = message.slice();
							if (v1Only) {
								const record = JSON.parse(decoder.decode(snapshot));
								if (record.kind === "fresh") {
									record.profiles = ["husky-di-rpc/1"];
									snapshot = new TextEncoder().encode(JSON.stringify(record));
								}
							}
							records.push({
								connectionIndex,
								origin,
								record: JSON.parse(decoder.decode(snapshot)) as Readonly<
									Record<string, unknown>
								>,
							});
							await Promise.resolve();
							if (!closed) {
								peerSource.next(snapshot);
							}
						},
						close,
					});
					connectorConnections.next(
						createConnection(connectorIngress, acceptorIngress, "connector"),
					);
					acceptorConnections.next(
						createConnection(acceptorIngress, connectorIngress, "acceptor"),
					);
					connectorConnections.complete();
				},
			};
		},
		records,
		disconnect(connectionIndex) {
			const link = links[connectionIndex];
			link?.connectorIngress.complete();
			link?.acceptorIngress.complete();
		},
	};
}

export async function waitFor(
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

interface IBrowserMemoryLink {
	readonly acceptorIngress: Subject<Uint8Array>;
	readonly connectorIngress: Subject<Uint8Array>;
}
