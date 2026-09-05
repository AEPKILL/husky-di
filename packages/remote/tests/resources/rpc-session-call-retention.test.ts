/**
 * @overview Behavioral evidence for terminal ownership, replay retirement, and local payload custody.
 * @author AEPKILL
 * @created 2026-09-05 15:00:00
 */

import { describe, expect, it, vi } from "vitest";
import { RpcCallTerminalTypeEnum } from "../../src/enums/protocol/rpc-call-terminal-type.enum";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import { createRpcSessionCallRetention } from "../../src/factories/rpc-session-call-retention.factory";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import type {
	IRpcReplayReservation,
	IRpcRetainedTerminal,
	IRpcSessionCallRetention,
} from "../../src/interfaces/session/rpc-session-call-retention.interface";
import { normalizeRpcApplicationValue } from "../../src/utils/rpc-application-value.util";

describe("Session call retention ownership", () => {
	it("RPC-ACK-002 RPC-LEDGER-005 separates request receipt, selected terminal, and terminal ACK", () => {
		const { retention, retainedBytes } = createRetention();
		const finish = vi.fn();
		const incoming = retention.retainIncoming("1", terminated);
		incoming.attach({ finish });
		const request = requireReplay(
			retention.reserveReplay({
				kind: RpcWireRecordKindEnum.call,
				callId: "1",
				service: "example.retention.v1",
				method: "run",
				args: ["x".repeat(1024)],
			}),
		);
		retention.commitReplay(1, request);
		expect(retainedBytes()).toBeGreaterThan(1024);

		retention.acknowledge(1);
		expect(retainedBytes()).toBe(0);
		expect(retention.incomingCount).toBe(1);
		expect(retention.hasActiveIncoming).toBe(true);
		expect(finish).not.toHaveBeenCalled();

		const completion = requireCompletion(
			incoming.selectCompletion(returnedVoid),
		);
		retention.acknowledge(1);
		expect(retention.incomingCount).toBe(1);
		expect(retention.hasActiveIncoming).toBe(false);
		retention.commitReplay(2, requireReplay(completion.replay));
		retention.acknowledge(1);
		expect(retention.incomingCount).toBe(1);

		// A synchronous send/ACK can retire identity before Framework publication.
		retention.acknowledge(2);
		expect(retention.incomingCount).toBe(0);
		expect(retainedBytes()).toBe(0);
		completion.publish();
		completion.publish();
		retention.terminateIncoming();
		expect(finish).toHaveBeenCalledExactlyOnceWith(returnedVoid);
	});

	it("RPC-LEDGER-004 selects the protected fallback once and detaches before reentrant publication", () => {
		const { retention } = createRetention(0);
		const incoming = retention.retainIncoming("1", terminated);
		const finish = vi.fn(() => {
			expect(retention.cancelIncoming("1")).toBeUndefined();
			retention.terminateIncoming();
		});
		incoming.attach({ finish });
		const completion = requireCompletion(
			incoming.selectCompletion({
				type: RpcCallTerminalTypeEnum.returned,
				value: normalizeRpcApplicationValue("ordinary storage is full"),
			}),
		);
		const replay = requireReplay(completion.replay);
		expect(replay.message).toMatchObject({
			kind: RpcWireRecordKindEnum.error,
			callId: "1",
			error: { code: RpcExceptionCodeEnum.handlerFailed },
		});
		expect(incoming.selectCompletion(returnedVoid)).toBeUndefined();
		retention.commitReplay(1, replay);
		completion.publish();
		completion.publish();
		expect(finish).toHaveBeenCalledExactlyOnceWith({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.handlerFailed,
		});
		retention.releaseReplay();
	});

	it("RPC-RESOURCE-001 distinguishes protected exhaustion from an already selected terminal", () => {
		const { retention } = createRetention(0);
		const leases: IRpcReplayReservation[] = [];
		for (let ordinal = 1; ordinal <= 256; ordinal += 1) {
			leases.push(
				requireReplay(
					retention.reserveReplay({
						kind: RpcWireRecordKindEnum.error,
						callId: String(ordinal),
						error: {
							code: RpcExceptionCodeEnum.handlerFailed,
							message: "failed",
						},
					}),
				),
			);
		}
		const incoming = retention.retainIncoming("257", terminated);
		const finish = vi.fn();
		incoming.attach({ finish });
		const completion = requireCompletion(
			incoming.selectCompletion(returnedVoid),
		);
		expect(completion.replay).toBeUndefined();
		expect(incoming.selectCompletion(returnedVoid)).toBeUndefined();
		completion.publish();
		expect(finish).toHaveBeenCalledExactlyOnceWith({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.handlerFailed,
		});
		for (const lease of leases) lease.release();
		retention.terminateIncoming();
	});

	it.each([
		terminated,
		{
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownService,
		},
		{
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownMethod,
		},
	] as const)("RPC-CALL-008 finishes a commit returning after close with its branch terminal: %j", (terminal) => {
		const { retention } = createRetention();
		const incoming = retention.retainIncoming("1", terminal);
		expect(retention.hasActiveIncoming).toBe(
			terminal.type === RpcCallTerminalTypeEnum.sessionTerminated,
		);
		retention.terminateIncoming();
		const finish = vi.fn();
		incoming.attach({ finish });
		expect(finish).toHaveBeenCalledExactlyOnceWith(terminal);
		expect(incoming.selectCompletion(returnedVoid)).toBeUndefined();
		expect(retention.incomingCount).toBe(0);
	});

	it("RPC-ACK-007 freezes recovery replay and applies ACKs without extending the barrier", () => {
		const { retention } = createRetention();
		const commit = (sequence: number) =>
			retention.commitReplay(
				sequence,
				requireReplay(
					retention.reserveReplay({
						kind: RpcWireRecordKindEnum.cancel,
						callId: String(sequence),
					}),
				),
			);
		commit(1);
		commit(2);
		commit(3);
		retention.resumeReplay(1);
		expect(retention.replayCount).toBe(2);
		expect(retention.takeReplay()?.sequence).toBe(2);
		commit(4);
		retention.acknowledge(3);
		expect(retention.takeReplay()).toBeUndefined();
		expect(retention.hasReplayBarrier).toBe(false);
		expect(retention.replayCount).toBe(1);
		retention.resumeReplay(3);
		expect(retention.takeReplay()?.sequence).toBe(4);
		expect(retention.takeReplay()).toBeUndefined();
		retention.releaseReplay();
	});

	it("RPC-RESOURCE-003 keeps a failed-admission frame's local payload charged through Session cleanup", () => {
		const { retention, retainedBytes } = createRetention();
		const reserve = () =>
			requireReplay(
				retention.reserveReplay({
					kind: RpcWireRecordKindEnum.call,
					callId: "1",
					service: "example.custody.v1",
					method: "run",
					args: ["x".repeat(1024)],
				}),
			);
		const guard = reserve();
		const guardBytes = retainedBytes();
		retention.commitReplay(1, reserve());
		expect(retainedBytes()).toBe(guardBytes * 2);
		retention.terminateIncoming();
		retention.releaseReplay();
		expect(retainedBytes()).toBe(guardBytes);
		guard.release();
		guard.release();
		expect(retainedBytes()).toBe(0);
	});

	it("RPC-LEDGER-003 retires capacity rejection identity only with its terminal ACK", () => {
		const { retention } = createRetention();
		const rejection = retention.rejectIncoming("1");
		expect(retention.hasActiveIncoming).toBe(false);
		expect(retention.incomingCount).toBe(1);
		retention.acknowledge(0);
		expect(retention.incomingCount).toBe(1);
		const replay = requireReplay(rejection.replay);
		expect(replay.message).toMatchObject({
			error: { code: RpcExceptionCodeEnum.unavailable },
		});
		retention.commitReplay(1, replay);
		retention.acknowledge(1);
		expect(retention.incomingCount).toBe(0);
	});
});

const terminated = { type: RpcCallTerminalTypeEnum.sessionTerminated } as const;
const returnedVoid = { type: RpcCallTerminalTypeEnum.returnedVoid } as const;

function createRetention(maximumBytes = 4 * 1024 * 1024): {
	retention: IRpcSessionCallRetention;
	retainedBytes(): number;
} {
	let retained = 0;
	return {
		retention: createRpcSessionCallRetention({
			codec: new RpcCodecImpl(),
			policy: {
				maxPendingInvocationsPerSession: 256,
				maxRetainedBytesPerSession: 4 * 1024 * 1024,
			},
			reserveRetainedBytes: (bytes) => {
				if (bytes > maximumBytes - retained) return undefined;
				retained += bytes;
				return {
					release: () => {
						retained -= bytes;
					},
				};
			},
		}),
		retainedBytes: () => retained,
	};
}

function requireReplay(
	replay: IRpcReplayReservation | undefined,
): IRpcReplayReservation {
	if (replay === undefined) throw new Error("Expected replay capacity.");
	return replay;
}

function requireCompletion(
	completion: IRpcRetainedTerminal | undefined,
): IRpcRetainedTerminal {
	if (completion === undefined)
		throw new Error("Expected the first terminal selection.");
	return completion;
}
