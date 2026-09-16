/**
 * @overview Recording boundary consumed by example callers, handlers and Adapter instrumentation.
 * @author AEPKILL
 * @created 2026-09-10 00:38:10
 */

import type { RpcEvent } from "@husky-di/remote";
import type {
	LabCallContext,
	LabRecordingSnapshot,
	LabTransportMessage,
} from "@/types/lab-recording.type";

export interface ILabRecorder {
	run<T>(
		context: LabCallContext,
		args: readonly unknown[],
		operation: () => T | Promise<T>,
	): Promise<T>;
	mark(traceId: string, phase: string, detail?: unknown): void;
	recordEvent(event: RpcEvent, peerId?: string): void;
	allocateConnectionId(): string;
	closeConnection(connectionId: string): void;
	recordTransport(
		phase: string,
		bytes: number,
		message?: LabTransportMessage,
	): void;
	snapshot(): LabRecordingSnapshot;
	clear(): void;
}
