/**
 * @overview Observes sent and received wire messages at example Adapter boundaries.
 * @author AEPKILL
 * @created 2026-09-10 00:38:10
 */

import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
	IRpcConnectorAdapter,
} from "@husky-di/remote";
import { map, type Observable, share, tap } from "rxjs";
import { LabTransportDirectionEnum } from "@/enums/lab-recording.enum";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";
import type { LabTransportMessage } from "@/types/lab-recording.type";
import { parseLabTransportMessage } from "@/utils/parse-lab-transport-message.util";

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
			const connectionId = recorder.allocateConnectionId();
			let sessionId: string | undefined;
			function parseMessage(
				message: Uint8Array,
				direction: LabTransportDirectionEnum,
			): LabTransportMessage {
				const record = parseLabTransportMessage(
					message,
					connectionId,
					direction,
				);
				sessionId ??= record.sessionId;
				return record;
			}
			function recordMessage(
				phase: string,
				message: LabTransportMessage,
			): void {
				recorder.recordTransport(
					phase,
					message.bytes,
					sessionId !== undefined
						? { ...message, sessionId: message.sessionId ?? sessionId }
						: message,
				);
			}
			observed = {
				message$: connection.message$.pipe(
					tap({
						next: (message) =>
							recordMessage(
								"Message received",
								parseMessage(message, LabTransportDirectionEnum.received),
							),
						complete: () => recorder.closeConnection(connectionId),
						error: () => recorder.closeConnection(connectionId),
					}),
					share({
						resetOnError: false,
						resetOnComplete: false,
						resetOnRefCountZero: false,
					}),
				),
				async send(message) {
					const record = parseMessage(message, LabTransportDirectionEnum.sent);
					try {
						await connection.send(message);
						recordMessage("Send locally admitted (not remote receipt)", record);
					} catch (error) {
						recordMessage("Send rejected", { ...record, outcome: "failed" });
						throw error;
					}
				},
				async close() {
					await connection.close();
					recorder.closeConnection(connectionId);
				},
			};
			connections.set(connection, observed);
			return observed;
		}),
	);
}
