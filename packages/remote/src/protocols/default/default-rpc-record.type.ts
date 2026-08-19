/**
 * @overview Private wire-record types for the husky-di-rpc/1 profile.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcApplicationValue } from "@/interfaces/rpc-protocol.interface";

export type DefaultRpcJsonRecord = {
	readonly [key: string]: DefaultRpcJsonValue;
};

export type DefaultRpcJsonValue =
	| null
	| boolean
	| string
	| number
	| readonly DefaultRpcJsonValue[]
	| DefaultRpcJsonRecord;

export type DefaultRpcFreshRequest = DefaultRpcJsonRecord & {
	readonly kind: "fresh";
	readonly profiles: readonly string[];
	readonly initiatorNonce: string;
};

export type DefaultRpcFreshAccept = DefaultRpcJsonRecord & {
	readonly kind: "accept";
	readonly profile: string;
	readonly sessionId: string;
	readonly bindingEpoch: 1;
	readonly responderNonce: string;
	readonly sessionSecret: string;
	readonly proof: string;
};

export type DefaultRpcResumeRequest = DefaultRpcJsonRecord & {
	readonly kind: "resume";
	readonly profile: string;
	readonly sessionId: string;
	readonly receivedThrough: number;
	readonly resumeAttempt: number;
	readonly initiatorNonce: string;
	readonly proof: string;
};

export type DefaultRpcResumeAccept = DefaultRpcJsonRecord & {
	readonly kind: "accept";
	readonly profile: string;
	readonly sessionId: string;
	readonly bindingEpoch: number;
	readonly receivedThrough: number;
	readonly responderNonce: string;
	readonly proof: string;
};

export type DefaultRpcResumeRejectCode =
	| "resume-rejected"
	| "continuity-failure"
	| "session-terminated";

export type DefaultRpcResumeReject = DefaultRpcJsonRecord & {
	readonly kind: "reject";
	readonly code: DefaultRpcResumeRejectCode;
	readonly responderNonce: string;
	readonly proof: string;
};

export type DefaultRpcResumeOutcome =
	| DefaultRpcResumeAccept
	| DefaultRpcResumeReject;

export type DefaultRpcCallMessage = DefaultRpcJsonRecord & {
	readonly kind: "call";
	readonly callId: string;
	readonly service: string;
	readonly method: string;
	readonly args: readonly RpcApplicationValue[];
};

export type DefaultRpcCancelMessage = DefaultRpcJsonRecord & {
	readonly kind: "cancel";
	readonly callId: string;
};

export type DefaultRpcResultMessage = DefaultRpcJsonRecord & {
	readonly kind: "result";
	readonly callId: string;
	readonly value?: RpcApplicationValue;
};

export type DefaultRpcWireErrorCode =
	| "canceled"
	| "unavailable"
	| "handler-failed"
	| "unknown-service"
	| "unknown-method";

export type DefaultRpcErrorMessage = DefaultRpcJsonRecord & {
	readonly kind: "error";
	readonly callId: string;
	readonly error: {
		readonly code: DefaultRpcWireErrorCode;
		readonly message: string;
		readonly details?: RpcApplicationValue;
	};
};

export type DefaultRpcSemanticMessage =
	| DefaultRpcCallMessage
	| DefaultRpcCancelMessage
	| DefaultRpcResultMessage
	| DefaultRpcErrorMessage;

export type DefaultRpcMessageEnvelope = DefaultRpcJsonRecord & {
	readonly kind: "message";
	readonly seq: number;
	readonly ackThrough?: number;
	readonly message: DefaultRpcSemanticMessage;
};

export type DefaultRpcAckRecord = DefaultRpcJsonRecord & {
	readonly kind: "ack";
	readonly ackThrough: number;
};

export type DefaultRpcControlRecord = DefaultRpcJsonRecord & {
	readonly kind: "ping" | "pong" | "close";
};

export type DefaultRpcActiveRecord =
	| DefaultRpcMessageEnvelope
	| DefaultRpcAckRecord
	| DefaultRpcControlRecord;
