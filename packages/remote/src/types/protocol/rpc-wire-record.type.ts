/**
 * @overview Private wire-record types for the husky-di-rpc/1 profile.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import type { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type {
	IRpcApplicationRecord,
	RpcApplicationValue,
} from "@/interfaces/protocol/rpc-protocol.interface";

export type RpcJsonRecord = IRpcApplicationRecord;

export type RpcJsonValue = RpcApplicationValue;

export type RpcFreshRequest = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.fresh;
	readonly profiles: readonly string[];
	readonly initiatorNonce: string;
};

export type RpcFreshAccept = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.accept;
	readonly profile: string;
	readonly sessionId: string;
	readonly bindingEpoch: 1;
	readonly responderNonce: string;
	readonly sessionSecret: string;
	readonly proof: string;
};

export type RpcResumeRequest = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.resume;
	readonly profile: string;
	readonly sessionId: string;
	readonly receivedThrough: number;
	readonly resumeAttempt: number;
	readonly initiatorNonce: string;
	readonly proof: string;
};

export type RpcBootstrapRequest = RpcFreshRequest | RpcResumeRequest;

export type RpcResumeAccept = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.accept;
	readonly profile: string;
	readonly sessionId: string;
	readonly bindingEpoch: number;
	readonly receivedThrough: number;
	readonly responderNonce: string;
	readonly proof: string;
};

export type RpcResumeReject = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.reject;
	readonly code: RpcResumeRejectCodeEnum;
	readonly responderNonce: string;
	readonly proof: string;
};

export type RpcResumeOutcome = RpcResumeAccept | RpcResumeReject;

export type RpcCallMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.call;
	readonly callId: string;
	readonly service: string;
	readonly member: string;
	readonly args: readonly RpcApplicationValue[];
};

export type RpcCancelMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.cancel;
	readonly callId: string;
};

export type RpcResultMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.result;
	readonly callId: string;
	readonly value?: RpcApplicationValue;
};

export type RpcWireErrorCode = Extract<
	RpcExceptionCodeEnum,
	| RpcExceptionCodeEnum.canceled
	| RpcExceptionCodeEnum.unavailable
	| RpcExceptionCodeEnum.handlerFailed
	| RpcExceptionCodeEnum.unknownService
	| RpcExceptionCodeEnum.unknownMember
>;

export type RpcErrorMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.error;
	readonly callId: string;
	readonly error: {
		readonly code: RpcWireErrorCode;
		readonly message: string;
	};
};

export type RpcStreamMethodStartMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.streamMethod;
	readonly streamId: string;
	readonly service: string;
	readonly member: string;
	readonly args: readonly RpcApplicationValue[];
	readonly creditThrough: 1;
};

export type RpcStreamPropertyStartMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.streamProperty;
	readonly streamId: string;
	readonly service: string;
	readonly member: string;
	readonly creditThrough: 1;
};

export type RpcStreamItemMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.streamItem;
	readonly streamId: string;
	readonly itemOrdinal: number;
	readonly value: RpcApplicationValue;
};

export type RpcStreamCreditMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.streamCredit;
	readonly streamId: string;
	readonly creditThrough: number;
};

export type RpcStreamCancelMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.streamCancel;
	readonly streamId: string;
};

export type RpcStreamCompleteMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.streamComplete;
	readonly streamId: string;
	readonly itemThrough: number;
};

export type RpcStreamWireErrorCode = Extract<
	RpcExceptionCodeEnum,
	| RpcExceptionCodeEnum.canceled
	| RpcExceptionCodeEnum.unavailable
	| RpcExceptionCodeEnum.handlerFailed
	| RpcExceptionCodeEnum.unknownService
	| RpcExceptionCodeEnum.unknownMember
	| RpcExceptionCodeEnum.overflow
>;

export type RpcStreamErrorMessage = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.streamError;
	readonly streamId: string;
	readonly itemThrough: number;
	readonly error: {
		readonly code: RpcStreamWireErrorCode;
		readonly message: string;
	};
};

export type RpcSemanticMessage =
	| RpcCallMessage
	| RpcCancelMessage
	| RpcResultMessage
	| RpcErrorMessage
	| RpcStreamMethodStartMessage
	| RpcStreamPropertyStartMessage
	| RpcStreamItemMessage
	| RpcStreamCreditMessage
	| RpcStreamCancelMessage
	| RpcStreamCompleteMessage
	| RpcStreamErrorMessage;

export type RpcMessageEnvelope = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.message;
	readonly seq: number;
	readonly ackThrough?: number;
	readonly message: RpcSemanticMessage;
};

export type RpcAckRecord = RpcJsonRecord & {
	readonly kind: RpcWireRecordKindEnum.ack;
	readonly ackThrough: number;
};

export type RpcControlRecord = RpcJsonRecord & {
	readonly kind:
		| RpcWireRecordKindEnum.ping
		| RpcWireRecordKindEnum.pong
		| RpcWireRecordKindEnum.close;
};

export type RpcActiveRecord =
	| RpcMessageEnvelope
	| RpcAckRecord
	| RpcControlRecord;
