/**
 * @overview Adds byte-count observations at example Adapter boundaries without inspecting wire payloads.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
	IRpcConnectorAdapter,
} from "@husky-di/remote";
import { map, type Observable, share, tap } from "rxjs";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";

export function createObservedConnectorAdapter(
	adapter: IRpcConnectorAdapter,
	recorder: ILabRecorder,
): IRpcConnectorAdapter {
	return {
		connection$: observeConnections(adapter.connection$, recorder),
		connect: (signal) => adapter.connect(signal),
	};
}

export function createObservedAcceptorAdapter(
	adapter: IRpcAcceptorAdapter,
	recorder: ILabRecorder,
): IRpcAcceptorAdapter {
	return {
		connection$: observeConnections(adapter.connection$, recorder),
		listen: (signal) => adapter.listen(signal),
	};
}

function observeConnections(
	source: Observable<IRpcConnection>,
	recorder: ILabRecorder,
): Observable<IRpcConnection> {
	const connections = new WeakMap<IRpcConnection, IRpcConnection>();
	return source.pipe(
		map((connection) => {
			let observed = connections.get(connection);
			if (observed) return observed;
			observed = {
				message$: connection.message$.pipe(
					tap((message) =>
						recorder.recordTransport("Message received", message.byteLength),
					),
					share({
						resetOnError: false,
						resetOnComplete: false,
						resetOnRefCountZero: false,
					}),
				),
				async send(message) {
					const bytes = message.byteLength;
					try {
						await connection.send(message);
						recorder.recordTransport(
							"Send locally admitted (not remote receipt)",
							bytes,
						);
					} catch (error) {
						recorder.recordTransport("Send rejected", bytes);
						throw error;
					}
				},
				close: () => connection.close(),
			};
			connections.set(connection, observed);
			return observed;
		}),
	);
}
