/**
 * @overview Routes validated semantic messages to their Session lifetime owner.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 00:10:00
 */

import { RPC_PROFILE } from "@/modules/protocol/constants/rpc-profile.const";
import { RpcWireRecordKindEnum } from "@/modules/protocol/enums/rpc-wire-record-kind.enum";
import type { IRpcSessionIncomingCalls } from "@/modules/protocol/interfaces/rpc-session-incoming-calls.interface";
import type { IRpcSessionInvocations } from "@/modules/protocol/interfaces/rpc-session-invocations.interface";
import type { IRpcSessionStreams } from "@/modules/protocol/interfaces/rpc-session-streams.interface";
import type { RpcSemanticMessage } from "@/modules/protocol/types/rpc-wire-record.type";

export function dispatchRpcSemanticMessage(
	message: RpcSemanticMessage,
	profile: string,
	incomingCalls: Pick<
		IRpcSessionIncomingCalls,
		"receiveCall" | "receiveCancel"
	>,
	invocations: Pick<IRpcSessionInvocations, "receiveTerminal">,
	streams: Pick<IRpcSessionStreams, "receive">,
): void {
	switch (message.kind) {
		case RpcWireRecordKindEnum.call:
			incomingCalls.receiveCall(message);
			return;
		case RpcWireRecordKindEnum.cancel:
			incomingCalls.receiveCancel(message.callId);
			return;
		case RpcWireRecordKindEnum.result:
		case RpcWireRecordKindEnum.error:
			invocations.receiveTerminal(message);
			return;
		default:
			if (profile !== RPC_PROFILE)
				throw new Error("RPC/1 does not support stream records.");
			streams.receive(message);
	}
}
