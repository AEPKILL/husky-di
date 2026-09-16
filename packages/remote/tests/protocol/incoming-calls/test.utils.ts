/**
 * @overview Shared incoming Protocol call admission and retention fixtures.
 * @author AEPKILL
 * @created 2026-09-12 02:38:04
 */

import { vi } from "vitest";
import type {
	IRpcProtocolHost,
	IRpcProtocolSessionHost,
	IRpcReplayReservation,
	IRpcSessionCallRetention,
	IRpcSessionIncomingCalls,
	RpcCallMessage,
	RpcSemanticMessage,
} from "../../../src/modules/protocol";
import {
	createRpcSessionCallRetention,
	createRpcSessionIncomingCalls,
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	RpcCodecImpl,
	RpcWireRecordKindEnum,
} from "../../../src/modules/protocol";

export interface IIncomingCallsHarness {
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

export function createIncomingCalls(
	options: {
		readonly normalizeApplicationArguments?: IRpcProtocolHost["normalizeApplicationArguments"];
		readonly normalizeApplicationValue?: IRpcProtocolHost["normalizeApplicationValue"];
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
		normalizeApplicationValue:
			options.normalizeApplicationValue ?? normalizeRpcApplicationValue,
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

export function createCall(callId: string): RpcCallMessage {
	return {
		kind: RpcWireRecordKindEnum.call,
		callId,
		service: "example.incoming.v1",
		method: "run",
		args: [1],
	};
}
