/**
 * @overview Observes byte counts and complete handshake frames at example Adapter boundaries.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
	IRpcConnectorAdapter,
} from "@husky-di/remote";
import { map, type Observable, share, tap } from "rxjs";
import { LabTransportDirectionEnum } from "@/enums/lab-recording.enum";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";
import type { LabHandshakeFrame } from "@/types/lab-recording.type";
import { parseLabHandshakeFrame } from "@/utils/parse-lab-handshake-frame.util";

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
			function parseFrame(
				message: Uint8Array,
				direction: LabTransportDirectionEnum,
			): LabHandshakeFrame | undefined {
				const frame = parseLabHandshakeFrame(message, connectionId, direction);
				sessionId ??= frame?.sessionId;
				return frame;
			}
			function recordFrame(
				phase: string,
				bytes: number,
				frame?: LabHandshakeFrame,
			): void {
				recorder.recordTransport(
					phase,
					bytes,
					frame && sessionId !== undefined
						? { ...frame, sessionId: frame.sessionId ?? sessionId }
						: frame,
				);
			}
			observed = {
				message$: connection.message$.pipe(
					tap((message) =>
						recordFrame(
							"Message received",
							message.byteLength,
							parseFrame(message, LabTransportDirectionEnum.received),
						),
					),
					share({
						resetOnError: false,
						resetOnComplete: false,
						resetOnRefCountZero: false,
					}),
				),
				async send(message) {
					const bytes = message.byteLength;
					const handshakeFrame = parseFrame(
						message,
						LabTransportDirectionEnum.sent,
					);
					try {
						await connection.send(message);
						recordFrame(
							"Send locally admitted (not remote receipt)",
							bytes,
							handshakeFrame,
						);
					} catch (error) {
						recordFrame(
							"Send rejected",
							bytes,
							handshakeFrame
								? { ...handshakeFrame, outcome: "failed" }
								: undefined,
						);
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
