/**
 * @overview Incoming Call admission, terminal publication, and reentrant close evidence.
 * @author AEPKILL
 * @created 2026-09-05 16:00:00
 */

import { describe, expect, it, vi } from "vitest";
import { RpcCallTerminalTypeEnum } from "../../src/enums/protocol/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "../../src/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import { createRpcSessionCallRetention } from "../../src/factories/rpc-session-call-retention.factory";
import { createRpcSessionIncomingCalls } from "../../src/factories/rpc-session-incoming-calls.factory";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import type {
	IRpcProtocolHost,
	IRpcProtocolSessionHost,
	RpcHandlerOutcome,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcReplayReservation,
	IRpcSessionCallRetention,
} from "../../src/interfaces/session/rpc-session-call-retention.interface";
import type { IRpcSessionIncomingCalls } from "../../src/interfaces/session/rpc-session-incoming-calls.interface";
import type {
	RpcCallMessage,
	RpcSemanticMessage,
} from "../../src/types/protocol/rpc-wire-record.type";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
} from "../../src/utils/rpc-application-value.util";

describe("Session Incoming Call admission and publication", () => {
	it("RPC-LEDGER-003 RPC-VALUE-004 validates call arguments before draining capacity rejection", () => {
		const harness = createIncomingCalls();
		harness.startDraining();

		expect(() =>
			harness.incoming.receiveCall({
				...createCall("1"),
				args: ["x".repeat(524_289)],
			}),
		).toThrow(TypeError);
		expect(harness.messages).toEqual([]);
		expect(harness.reserveIncomingCall).not.toHaveBeenCalled();

		// The same ordinal remains available after failed normalization.
		harness.incoming.receiveCall(createCall("1"));
		expect(harness.messages).toEqual([
			expect.objectContaining({
				callId: "1",
				error: expect.objectContaining({
					code: RpcExceptionCodeEnum.unavailable,
				}),
			}),
		]);
		expect(harness.reserveIncomingCall).not.toHaveBeenCalled();
		harness.close();
	});

	it("RPC-LEDGER-003 observes a drain that begins during argument normalization before Framework reservation", () => {
		const harness = createIncomingCalls({
			normalizeApplicationArguments: (args) => {
				harness.startDraining();
				return normalizeRpcApplicationArguments(args);
			},
		});
		harness.incoming.receiveCall(createCall("1"));

		expect(harness.reserveIncomingCall).not.toHaveBeenCalled();
		expect(harness.messages).toEqual([
			expect.objectContaining({
				callId: "1",
				error: expect.objectContaining({
					code: RpcExceptionCodeEnum.unavailable,
				}),
			}),
		]);
		harness.close();
	});

	it("RPC-LEDGER-002 RPC-LEDGER-003 RPC-LEDGER-005 keeps ordinal authority after rejection and terminal ACK", () => {
		const harness = createIncomingCalls();
		harness.incoming.receiveCall(createCall("1"));
		expect(harness.retention.incomingCount).toBe(1);
		expect(harness.incoming.hasActive).toBe(false);
		expect(harness.reserveIncomingCall).toHaveBeenCalledExactlyOnceWith(
			{
				service: "example.incoming.v1",
				method: "run",
				args: normalizeRpcApplicationArguments([1]),
			},
			expect.any(Function),
		);
		harness.retention.acknowledge(1);
		expect(harness.retention.incomingCount).toBe(0);

		expect(() => harness.incoming.receiveCall(createCall("1"))).toThrow(
			/Call Ordinal/,
		);
		expect(() => harness.incoming.receiveCancel("2")).toThrow(
			/future Call Ordinal/,
		);
		harness.incoming.receiveCancel("1");
		expect(harness.messages).toHaveLength(1);
		harness.incoming.receiveCall(createCall("2"));
		expect(harness.messages).toHaveLength(2);
		expect(harness.messages[1]).toMatchObject({
			callId: "2",
			error: { code: RpcExceptionCodeEnum.unavailable },
		});
		harness.close();
	});

	it("RPC-LEDGER-003 rejects local incoming capacity before Framework route lookup", () => {
		const outcome = Promise.withResolvers<RpcHandlerOutcome>();
		const finish = vi.fn();
		const harness = createIncomingCalls({
			reserveIncomingCall: (_request, consume) => {
				expect(
					consume({
						kind: RpcIncomingCallKindEnum.handler,
						commit: () => ({ handlerOutcome: outcome.promise, finish }),
					}),
				).toBeUndefined();
				return true;
			},
		});
		for (let ordinal = 1; ordinal <= 256; ordinal += 1) {
			harness.incoming.receiveCall(createCall(String(ordinal)));
		}
		expect(harness.incoming.hasActive).toBe(true);
		harness.incoming.receiveCall(createCall("257"));
		expect(harness.reserveIncomingCall).toHaveBeenCalledTimes(256);
		expect(harness.messages).toEqual([
			expect.objectContaining({
				callId: "257",
				error: expect.objectContaining({
					code: RpcExceptionCodeEnum.unavailable,
				}),
			}),
		]);
		expect(finish).not.toHaveBeenCalled();
		harness.close();
		expect(finish).toHaveBeenCalledTimes(256);
	});

	it.each([
		RpcIncomingCallKindEnum.handler,
		RpcExceptionCodeEnum.unknownService,
		RpcExceptionCodeEnum.unknownMethod,
	] as const)("RPC-CALL-008 retains admission before commit and finishes a handle returned after close: %s", (branch) => {
		const finish = vi.fn();
		const readHandlerOutcome = vi.fn(() =>
			Promise.resolve<RpcHandlerOutcome>(returnedVoid),
		);
		const harness = createIncomingCalls({
			reserveIncomingCall: (_request, consume) => {
				const closeDuringCommit = () => {
					expect(harness.retention.incomingCount).toBe(1);
					expect(harness.incoming.hasActive).toBe(
						branch === RpcIncomingCallKindEnum.handler,
					);
					harness.close();
				};
				if (branch === RpcIncomingCallKindEnum.handler) {
					consume({
						kind: RpcIncomingCallKindEnum.handler,
						commit: () => {
							closeDuringCommit();
							return {
								finish,
								get handlerOutcome() {
									return readHandlerOutcome();
								},
							};
						},
					});
				} else {
					consume({
						kind: RpcIncomingCallKindEnum.unknown,
						code: branch,
						commit: () => {
							closeDuringCommit();
							return { finish };
						},
					});
				}
				return true;
			},
		});

		harness.incoming.receiveCall(createCall("1"));
		expect(finish).toHaveBeenCalledExactlyOnceWith(
			branch === RpcIncomingCallKindEnum.handler
				? { type: RpcCallTerminalTypeEnum.sessionTerminated }
				: { type: RpcCallTerminalTypeEnum.failed, code: branch },
		);
		expect(readHandlerOutcome).not.toHaveBeenCalled();
		expect(harness.incoming.hasActive).toBe(false);
		expect(harness.retention.incomingCount).toBe(0);
		expect(harness.messages).toEqual([]);
	});

	it("RPC-CALL-006 RPC-LEDGER-005 admits handler terminal before publication through synchronous ACK and close", async () => {
		const outcome = Promise.withResolvers<RpcHandlerOutcome>();
		const order: string[] = [];
		const finish = vi.fn(() => order.push("finish"));
		const harness = createIncomingCalls({
			reserveIncomingCall: (_request, consume) => {
				consume({
					kind: RpcIncomingCallKindEnum.handler,
					commit: () => ({ handlerOutcome: outcome.promise, finish }),
				});
				return true;
			},
			onTerminal: () => {
				order.push("terminal");
				expect(finish).not.toHaveBeenCalled();
				expect(harness.incoming.hasActive).toBe(false);
				expect(harness.retainedBytes()).toBeGreaterThan(1024);
				harness.retention.acknowledge(1);
				expect(harness.retention.incomingCount).toBe(0);
				harness.close();
			},
		});
		harness.incoming.receiveCall(createCall("1"));
		const returned = {
			type: RpcCallTerminalTypeEnum.returned,
			value: normalizeRpcApplicationValue("x".repeat(1024)),
		} as const;
		outcome.resolve(returned);
		await outcome.promise;

		expect(order).toEqual(["terminal", "finish"]);
		expect(finish).toHaveBeenCalledExactlyOnceWith(returned);
		expect(harness.retainedBytes()).toBe(0);
		expect(harness.messages).toHaveLength(1);
		harness.incoming.receiveCancel("1");
		harness.close();
		expect(finish).toHaveBeenCalledTimes(1);
	});

	it.each([
		false,
		true,
	])("RPC-CALL-006 RPC-WIRE-013 publishes cancellation before terminal admission and ignores late settlement with close=%s", async (closeDuringFinish) => {
		const outcome = Promise.withResolvers<RpcHandlerOutcome>();
		const order: string[] = [];
		const finish = vi.fn(() => {
			order.push("finish");
			expect(harness.incoming.hasActive).toBe(false);
			harness.incoming.receiveCancel("1");
			if (closeDuringFinish) harness.close();
		});
		const harness = createIncomingCalls({
			reserveIncomingCall: (_request, consume) => {
				consume({
					kind: RpcIncomingCallKindEnum.handler,
					commit: () => ({ handlerOutcome: outcome.promise, finish }),
				});
				return true;
			},
			onTerminal: () => order.push("terminal"),
		});
		harness.incoming.receiveCall(createCall("1"));
		harness.incoming.receiveCancel("1");
		outcome.resolve(returnedVoid);
		await outcome.promise;

		expect(order).toEqual(
			closeDuringFinish ? ["finish"] : ["finish", "terminal"],
		);
		expect(finish).toHaveBeenCalledExactlyOnceWith({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.canceled,
		});
		expect(harness.messages).toHaveLength(closeDuringFinish ? 0 : 1);
		if (!closeDuringFinish) {
			expect(harness.messages[0]).toMatchObject({
				error: { code: RpcExceptionCodeEnum.canceled },
			});
		}
		harness.close();
	});

	it.each([
		false,
		true,
	])("RPC-LEDGER-003 publishes an unknown route before terminal admission with close=%s", (closeDuringFinish) => {
		const order: string[] = [];
		const finish = vi.fn(() => {
			order.push("finish");
			if (closeDuringFinish) harness.close();
		});
		const harness = createIncomingCalls({
			reserveIncomingCall: (_request, consume) => {
				consume({
					kind: RpcIncomingCallKindEnum.unknown,
					code: RpcExceptionCodeEnum.unknownMethod,
					commit: () => ({ finish }),
				});
				return true;
			},
			onTerminal: () => order.push("terminal"),
		});
		harness.incoming.receiveCall(createCall("1"));

		expect(order).toEqual(
			closeDuringFinish ? ["finish"] : ["finish", "terminal"],
		);
		expect(finish).toHaveBeenCalledExactlyOnceWith({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownMethod,
		});
		expect(harness.messages).toHaveLength(closeDuringFinish ? 0 : 1);
		harness.close();
	});

	it("RPC-LEDGER-004 maps rejected handler settlement to one safe terminal", async () => {
		const outcome = Promise.withResolvers<RpcHandlerOutcome>();
		const finish = vi.fn();
		const harness = createIncomingCalls({
			reserveIncomingCall: (_request, consume) => {
				consume({
					kind: RpcIncomingCallKindEnum.handler,
					commit: () => ({ handlerOutcome: outcome.promise, finish }),
				});
				return true;
			},
		});
		harness.incoming.receiveCall(createCall("1"));
		outcome.reject(new Error("Private handler failure"));
		await outcome.promise.catch(() => undefined);

		expect(finish).toHaveBeenCalledExactlyOnceWith({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.handlerFailed,
		});
		expect(harness.messages).toEqual([
			expect.objectContaining({
				kind: RpcWireRecordKindEnum.error,
				error: expect.objectContaining({
					code: RpcExceptionCodeEnum.handlerFailed,
				}),
			}),
		]);
		expect(JSON.stringify(harness.messages)).not.toContain(
			"Private handler failure",
		);
		harness.close();
	});

	it("RPC-LEDGER-004 RPC-RESOURCE-001 publishes the selected failure when protected exhaustion closes the Session", async () => {
		const outcome = Promise.withResolvers<RpcHandlerOutcome>();
		const order: string[] = [];
		const finish = vi.fn(() => order.push("finish"));
		const onFault = vi.fn(() => {
			order.push("fault");
			harness.close();
		});
		const harness = createIncomingCalls({
			reserveIncomingCall: (_request, consume) => {
				consume({
					kind: RpcIncomingCallKindEnum.handler,
					commit: () => ({ handlerOutcome: outcome.promise, finish }),
				});
				return true;
			},
			onFault,
		});
		const leases: IRpcReplayReservation[] = [];
		for (let ordinal = 1; ordinal <= 256; ordinal += 1) {
			const lease = harness.retention.reserveReplay({
				kind: RpcWireRecordKindEnum.error,
				callId: String(ordinal),
				error: { code: RpcExceptionCodeEnum.handlerFailed, message: "failed" },
			});
			if (lease === undefined) throw new Error("Expected protected capacity.");
			leases.push(lease);
		}
		harness.incoming.receiveCall(createCall("1"));
		outcome.reject(new Error("Private handler failure"));
		await outcome.promise.catch(() => undefined);

		expect(order).toEqual(["fault", "finish"]);
		expect(onFault).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
		expect(finish).toHaveBeenCalledExactlyOnceWith({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.handlerFailed,
		});
		expect(harness.messages).toEqual([]);
		for (const lease of leases) lease.release();
	});
});

interface IIncomingCallsHarness {
	readonly incoming: IRpcSessionIncomingCalls;
	readonly retention: IRpcSessionCallRetention;
	readonly messages: RpcSemanticMessage[];
	readonly reserveIncomingCall: ReturnType<
		typeof vi.fn<IRpcProtocolSessionHost["reserveIncomingCall"]>
	>;
	retainedBytes(): number;
	startDraining(): void;
	close(): void;
}

const returnedVoid = { type: RpcCallTerminalTypeEnum.returnedVoid } as const;

function createIncomingCalls(
	options: {
		readonly normalizeApplicationArguments?: IRpcProtocolHost["normalizeApplicationArguments"];
		readonly reserveIncomingCall?: IRpcProtocolSessionHost["reserveIncomingCall"];
		readonly onTerminal?: (replay: IRpcReplayReservation) => void;
		readonly onFault?: (error: Error) => void;
	} = {},
): IIncomingCallsHarness {
	let retainedBytes = 0;
	let draining = false;
	const retention = createRpcSessionCallRetention({
		codec: new RpcCodecImpl(),
		policy: {
			maxPendingInvocationsPerSession: 256,
			maxRetainedBytesPerSession: 4 * 1024 * 1024,
		},
		reserveRetainedBytes: (bytes) => {
			retainedBytes += bytes;
			return {
				release: () => {
					retainedBytes -= bytes;
				},
			};
		},
	});
	const reserveIncomingCall = vi.fn<
		IRpcProtocolSessionHost["reserveIncomingCall"]
	>(options.reserveIncomingCall ?? (() => false));
	const messages: RpcSemanticMessage[] = [];
	const incoming = createRpcSessionIncomingCalls({
		retention,
		normalizeApplicationArguments:
			options.normalizeApplicationArguments ?? normalizeRpcApplicationArguments,
		reserveIncomingCall,
		isDraining: () => draining,
		onTerminal: (replay) => {
			messages.push(replay.message);
			retention.commitReplay(messages.length, replay);
			options.onTerminal?.(replay);
		},
		onFault: (error) => {
			if (options.onFault !== undefined) {
				options.onFault(error);
				return;
			}
			throw error;
		},
	});
	return {
		incoming,
		retention,
		messages,
		reserveIncomingCall,
		retainedBytes: () => retainedBytes,
		startDraining: () => {
			draining = true;
		},
		close: () => {
			incoming.terminate();
			retention.releaseReplay();
		},
	};
}

function createCall(callId: string): RpcCallMessage {
	return {
		kind: RpcWireRecordKindEnum.call,
		callId,
		service: "example.incoming.v1",
		method: "run",
		args: [1],
	};
}
