/**
 * @overview Public semantic Protocol implementor seam.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import type { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import type { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { IRpcRetainedBytesReservation } from "@/interfaces/common/rpc-retained-bytes-ledger.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

export type { IRpcRetainedBytesReservation };

export type RpcApplicationValue =
	| null
	| boolean
	| string
	| number
	| readonly RpcApplicationValue[]
	| IRpcApplicationRecord;

export interface IRpcApplicationRecord {
	readonly [key: string]: RpcApplicationValue;
}

export interface IRpcApplicationSnapshot<
	T extends RpcApplicationValue = RpcApplicationValue,
> {
	readonly value: T;
	readonly weight: number;
	readonly [RPC_APPLICATION_SNAPSHOT_TYPE]: never;
}

export interface IRpcApplicationArgumentsSnapshot
	extends IRpcApplicationSnapshot<readonly RpcApplicationValue[]> {}

export type RpcCallFailure = Exclude<
	RpcExceptionCodeEnum,
	RpcExceptionCodeEnum.protocol
>;

export type RpcUnknownCallFailure = Extract<
	RpcCallFailure,
	RpcExceptionCodeEnum.unknownService | RpcExceptionCodeEnum.unknownMethod
>;

export type RpcIncomingFailure = Extract<
	RpcCallFailure,
	| RpcExceptionCodeEnum.canceled
	| RpcExceptionCodeEnum.handlerFailed
	| RpcUnknownCallFailure
>;

export type RpcCallOutcome =
	| { readonly type: RpcCallTerminalTypeEnum.returnedVoid }
	| {
			readonly type: RpcCallTerminalTypeEnum.returned;
			readonly value: IRpcApplicationSnapshot;
	  }
	| {
			readonly type: RpcCallTerminalTypeEnum.failed;
			readonly code: RpcCallFailure;
	  };

export type RpcHandlerOutcome =
	| { readonly type: RpcCallTerminalTypeEnum.notStarted }
	| { readonly type: RpcCallTerminalTypeEnum.returnedVoid }
	| {
			readonly type: RpcCallTerminalTypeEnum.returned;
			readonly value: IRpcApplicationSnapshot;
	  }
	| {
			readonly type: RpcCallTerminalTypeEnum.failed;
			readonly code: RpcExceptionCodeEnum.handlerFailed;
	  };

export type RpcIncomingTerminal =
	| { readonly type: RpcCallTerminalTypeEnum.returnedVoid }
	| {
			readonly type: RpcCallTerminalTypeEnum.returned;
			readonly value: IRpcApplicationSnapshot;
	  }
	| {
			readonly type: RpcCallTerminalTypeEnum.failed;
			readonly code: RpcIncomingFailure;
	  }
	| { readonly type: RpcCallTerminalTypeEnum.sessionTerminated };

export interface IRpcProtocolRuntimePolicy {
	readonly maxSessions: number;
	readonly maxHandshakes: number;
	readonly maxPendingInvocationsPerSession: number;
	readonly maxRetainedBytesPerSession: number;
	readonly maxRetainedBytesTotal: number;
	readonly maxHandlersPerSession: number;
	readonly maxHandlersTotal: number;
	readonly ackDelayMs: number;
	readonly activityProbeIntervalMs: number;
	readonly silenceTimeoutMs: number;
	readonly sendProgressTimeoutMs: number;
	readonly bindingAttemptTimeoutMs: number;
	readonly recoveryGraceMs: number;
	readonly shutdownDeadlineMs: number;
}

export type RpcProtocolFaultReason = Extract<
	RpcCloseReasonEnum,
	RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault
>;

export interface IRpcProtocolHost {
	readonly policy: IRpcProtocolRuntimePolicy;
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	normalizeApplicationValue(value: unknown): IRpcApplicationSnapshot;
	normalizeApplicationArguments(
		value: unknown,
	): IRpcApplicationArgumentsSnapshot;
	applicationValuesEqual(
		left: IRpcApplicationSnapshot,
		right: IRpcApplicationSnapshot,
	): boolean;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface IRpcProtocolInvocationRequest {
	readonly service: string;
	readonly method: string;
	readonly args: IRpcApplicationArgumentsSnapshot;
}

export interface IRpcProtocolInvocationSink {
	finish(outcome: RpcCallOutcome): void;
}

export interface IRpcProtocolInvocationReservation {
	commit(sink: IRpcProtocolInvocationSink): IRpcProtocolInvocation;
	release(): void;
}

export interface IRpcProtocolInvocation {
	start(): void;
	cancel(): void;
}

export interface IRpcProtocolSession {
	reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined;
	forceClose(): void;
}

export interface IRpcProtocolIncomingCallRequest {
	readonly service: string;
	readonly method: string;
	readonly args: IRpcApplicationArgumentsSnapshot;
}

export interface IRpcProtocolIncomingCall {
	finish(outcome: RpcIncomingTerminal): void;
}

export interface IRpcProtocolIncomingHandlerCall
	extends IRpcProtocolIncomingCall {
	readonly handlerOutcome: Promise<RpcHandlerOutcome>;
}

export interface IRpcProtocolIncomingCallReservation<
	TCall extends IRpcProtocolIncomingCall = IRpcProtocolIncomingCall,
> {
	commit(): TCall;
	release(): void;
}

export type RpcProtocolIncomingCallReservation =
	| {
			readonly kind: RpcIncomingCallKindEnum.handler;
			readonly reservation: IRpcProtocolIncomingCallReservation<IRpcProtocolIncomingHandlerCall>;
	  }
	| {
			readonly kind: RpcIncomingCallKindEnum.unknown;
			readonly code: RpcUnknownCallFailure;
			readonly reservation: IRpcProtocolIncomingCallReservation<IRpcProtocolIncomingCall>;
	  };

export type RpcSessionCloseReason = Exclude<
	RpcCloseReasonEnum,
	RpcCloseReasonEnum.cleanupFailed
>;

export type RpcProtocolSessionTransitionCloseReason = Exclude<
	RpcSessionCloseReason,
	RpcProtocolFaultReason | RpcCloseReasonEnum.shutdownDeadline
>;

export type RpcProtocolSessionTransition =
	| {
			readonly type: RpcProtocolSessionTransitionTypeEnum.draining;
			readonly reason: RpcCloseReasonEnum.counterExhaustion;
	  }
	| {
			readonly type: RpcProtocolSessionTransitionTypeEnum.recovering;
			readonly cause?: Error;
	  }
	| { readonly type: RpcProtocolSessionTransitionTypeEnum.recovered }
	| {
			readonly type: RpcProtocolSessionTransitionTypeEnum.closed;
			readonly reason: RpcProtocolSessionTransitionCloseReason;
			readonly cause?: Error;
	  };

export interface IRpcProtocolSessionHost {
	reserveIncomingCall(
		request: IRpcProtocolIncomingCallRequest,
	): RpcProtocolIncomingCallReservation | undefined;
	transition(transition: RpcProtocolSessionTransition): void;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface IRpcProtocolConnectorHost extends IRpcProtocolHost {
	attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
}

export interface IRpcProtocolAcceptorHost extends IRpcProtocolHost {
	admitSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
}

export interface IRpcProtocolRoleRuntime {
	shutdown(): Promise<void>;
	close(): void;
	cleanup(): Promise<void>;
}

export interface IRpcProtocolConnectorRuntime extends IRpcProtocolRoleRuntime {
	bind(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
}

export interface IRpcProtocolAcceptorRuntime extends IRpcProtocolRoleRuntime {
	accept(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
}

export interface IRpcProtocol {
	createConnector(
		host: IRpcProtocolConnectorHost,
	): IRpcProtocolConnectorRuntime;
	createAcceptor(host: IRpcProtocolAcceptorHost): IRpcProtocolAcceptorRuntime;
}

declare const RPC_APPLICATION_SNAPSHOT_TYPE: unique symbol;
