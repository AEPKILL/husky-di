/**
 * @overview Private incoming-call commit, release and termination capabilities.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type {
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	RpcIncomingCallKindEnum,
	RpcUnknownCallFailure,
} from "@/modules/protocol";

export interface IRpcPreparedIncomingCall {
	release(): void;
	terminate(): void;
}

export interface IRpcPreparedHandlerIncomingCall
	extends IRpcPreparedIncomingCall {
	readonly kind: RpcIncomingCallKindEnum.handler;
	commit(): IRpcProtocolIncomingHandlerCall;
}

export interface IRpcPreparedUnknownIncomingCall
	extends IRpcPreparedIncomingCall {
	readonly kind: RpcIncomingCallKindEnum.unknown;
	readonly code: RpcUnknownCallFailure;
	commit(): IRpcProtocolIncomingCall;
}

export type RpcPreparedIncomingCall =
	| IRpcPreparedHandlerIncomingCall
	| IRpcPreparedUnknownIncomingCall;
