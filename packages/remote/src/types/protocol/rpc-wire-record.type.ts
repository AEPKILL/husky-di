/**
 * @overview Private wire-record types for the husky-di-rpc/1 profile.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcApplicationValue } from "@/interfaces/protocol/rpc-protocol.interface";

export type RpcJsonRecord = {
	readonly [key: string]: RpcJsonValue;
};

export type RpcJsonValue =
	| null
	| boolean
	| string
	| number
	| readonly RpcJsonValue[]
	| RpcJsonRecord;

export type RpcFreshRequest = RpcJsonRecord & {
	readonly kind: "fresh";
	readonly profiles: readonly string[];
	readonly initiatorNonce: string;
};

export type RpcFreshAccept = RpcJsonRecord & {
	readonly kind: "accept";
	readonly profile: string;
	readonly sessionId: string;
	readonly bindingEpoch: 1;
	readonly responderNonce: string;
	readonly sessionSecret: string;
	readonly proof: string;
};

export type RpcResumeRequest = RpcJsonRecord & {
	readonly kind: "resume";
	readonly profile: string;
	readonly sessionId: string;
	readonly receivedThrough: number;
	readonly resumeAttempt: number;
	readonly initiatorNonce: string;
	readonly proof: string;
};

export type RpcBootstrapRequest = RpcFreshRequest | RpcResumeRequest;

export type RpcResumeAccept = RpcJsonRecord & {
	readonly kind: "accept";
	readonly profile: string;
	readonly sessionId: string;
	readonly bindingEpoch: number;
	readonly receivedThrough: number;
	readonly responderNonce: string;
	readonly proof: string;
};

export type RpcResumeRejectCode =
	| "resume-rejected"
	| "continuity-failure"
	| "session-terminated";

export type RpcResumeReject = RpcJsonRecord & {
	readonly kind: "reject";
	readonly code: RpcResumeRejectCode;
	readonly responderNonce: string;
	readonly proof: string;
};

export type RpcResumeOutcome = RpcResumeAccept | RpcResumeReject;

export type RpcCallMessage = RpcJsonRecord & {
	readonly kind: "call";
	readonly callId: string;
	readonly service: string;
	readonly method: string;
	readonly args: readonly RpcApplicationValue[];
};

export type RpcCancelMessage = RpcJsonRecord & {
	readonly kind: "cancel";
	readonly callId: string;
};

export type RpcResultMessage = RpcJsonRecord & {
	readonly kind: "result";
	readonly callId: string;
	readonly value?: RpcApplicationValue;
};

export type RpcWireErrorCode =
	| "canceled"
	| "unavailable"
	| "handler-failed"
	| "unknown-service"
	| "unknown-method";

export type RpcErrorMessage = RpcJsonRecord & {
	readonly kind: "error";
	readonly callId: string;
	readonly error: {
		readonly code: RpcWireErrorCode;
		readonly message: string;
		readonly details?: RpcApplicationValue;
	};
};

export type RpcSemanticMessage =
	| RpcCallMessage
	| RpcCancelMessage
	| RpcResultMessage
	| RpcErrorMessage;

export type RpcMessageEnvelope = RpcJsonRecord & {
	readonly kind: "message";
	readonly seq: number;
	readonly ackThrough?: number;
	readonly message: RpcSemanticMessage;
};

export type RpcAckRecord = RpcJsonRecord & {
	readonly kind: "ack";
	readonly ackThrough: number;
};

export type RpcControlRecord = RpcJsonRecord & {
	readonly kind: "ping" | "pong" | "close";
};

export type RpcActiveRecord =
	| RpcMessageEnvelope
	| RpcAckRecord
	| RpcControlRecord;
