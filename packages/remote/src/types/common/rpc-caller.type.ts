/**
 * @overview Caller-facing RPC state plus colocated option schemas and derived types.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { type input, type output, z } from "zod";

import type { RpcAcceptorListenerStopReasonEnum } from "@/enums/rpc-acceptor-listener-stop-reason.enum";
import type { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type { RpcException } from "@/exceptions/rpc.exception";
import type {
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnectorAdapter } from "@/interfaces/transport/rpc-adapter.interface";
import type {
	RpcProtocolAcceptorFactory,
	RpcProtocolConnectorFactory,
} from "@/types/protocol/rpc-protocol-factory.type";
import {
	rpcAcceptorRuntimePolicyOptionsSchema,
	rpcConnectorRuntimePolicyOptionsSchema,
} from "@/types/protocol/rpc-runtime-policy.type";
import { readRpcAbortSignalAborted } from "@/utils/rpc-cancellation.util";

export type RpcPeerState =
	| { readonly status: RpcStateStatusEnum.unbound }
	| { readonly status: RpcStateStatusEnum.connecting }
	| { readonly status: RpcStateStatusEnum.connected }
	| {
			readonly status: RpcStateStatusEnum.draining;
			readonly reason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.counterExhaustion;
	  }
	| { readonly status: RpcStateStatusEnum.recovering }
	| RpcSessionClosedState;

export type RpcConnectorState =
	| { readonly status: RpcStateStatusEnum.active }
	| { readonly status: RpcStateStatusEnum.draining }
	| { readonly status: RpcStateStatusEnum.closing }
	| RpcConnectorClosedState;

export type RpcAcceptorListenerState =
	| { readonly status: RpcStateStatusEnum.idle }
	| { readonly status: RpcStateStatusEnum.starting }
	| { readonly status: RpcStateStatusEnum.listening }
	| {
			readonly status: RpcStateStatusEnum.stopped;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason: RpcAcceptorListenerStopReasonEnum;
	  }
	| {
			readonly status: RpcStateStatusEnum.stopped;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly error: Error;
	  };

export type RpcAcceptorState =
	| {
			readonly status: RpcStateStatusEnum.active;
			readonly listener: RpcAcceptorListenerState;
	  }
	| { readonly status: RpcStateStatusEnum.draining }
	| { readonly status: RpcStateStatusEnum.closing }
	| RpcAcceptorClosedState;

export type RpcConnectorOptions = Readonly<
	input<typeof rpcConnectorOptionsSchema>
>;

export type RpcConnectorConnectOptions = Readonly<
	input<typeof rpcConnectorConnectOptionsSchema>
>;

export type RpcConnectorConnectOptionsSnapshot = Readonly<
	output<typeof rpcConnectorConnectOptionsSchema>
>;

export type RpcAcceptorOptions = Readonly<
	input<typeof rpcAcceptorOptionsSchema>
>;

export const rpcConnectorOptionsObjectSchema = z.strictObject({
	protocolFactory: z.custom<RpcProtocolConnectorFactory>().optional(),
	runtimePolicy: rpcConnectorRuntimePolicyOptionsSchema.prefault({}),
});

export const rpcConnectorOptionsSchema = z
	.custom<input<typeof rpcConnectorOptionsObjectSchema>>()
	.transform((source) => ({
		source,
		ownKeys: Object.keys(Object(source)),
	}))
	.pipe(
		z.object({
			source: rpcConnectorOptionsObjectSchema,
			ownKeys: z.array(rpcConnectorOptionsObjectSchema.keyof()),
		}),
	)
	.transform(({ source }) => source)
	.readonly();

export const rpcAcceptorOptionsObjectSchema = z.strictObject({
	protocolFactory: z.custom<RpcProtocolAcceptorFactory>().optional(),
	runtimePolicy: rpcAcceptorRuntimePolicyOptionsSchema.prefault({}),
});

export const rpcAcceptorOptionsSchema = z
	.custom<input<typeof rpcAcceptorOptionsObjectSchema>>()
	.transform((source) => ({
		source,
		ownKeys: Object.keys(Object(source)),
	}))
	.pipe(
		z.object({
			source: rpcAcceptorOptionsObjectSchema,
			ownKeys: z.array(rpcAcceptorOptionsObjectSchema.keyof()),
		}),
	)
	.transform(({ source }) => source)
	.readonly();

export const rpcConnectorConnectOptionsObjectSchema = z.strictObject({
	signal: z
		.custom<AbortSignal>()
		.transform((signal, context) => {
			try {
				return {
					signal,
					aborted: readRpcAbortSignalAborted(signal),
				};
			} catch {
				context.addIssue({
					code: "custom",
					message: "signal must be a platform AbortSignal.",
				});
				return z.NEVER;
			}
		})
		.optional(),
	adapter: z.custom<IRpcConnectorAdapter>(),
});

export const rpcConnectorConnectOptionsSchema = z
	.custom<input<typeof rpcConnectorConnectOptionsObjectSchema>>()
	.transform((source) => ({
		source,
		ownKeys: Object.keys(Object(source)),
	}))
	.pipe(
		z.object({
			source: rpcConnectorConnectOptionsObjectSchema,
			ownKeys: z.array(rpcConnectorConnectOptionsObjectSchema.keyof()),
		}),
	)
	.transform(({ source }) => source)
	.readonly();

export const rpcConnectorAdapterMembersSchema = z.object({
	connection$: z.unknown(),
	connect: z.unknown(),
});

export const rpcConnectorObservableSchema = z.custom<
	Readonly<{ subscribe: (...args: never[]) => unknown }>
>(
	(value) =>
		((typeof value === "object" && value !== null) ||
			typeof value === "function") &&
		typeof Reflect.get(value as object, "subscribe") === "function",
);

export const rpcConnectorCallableSchema = z.function();

type RpcNormalSessionCloseReason = Extract<
	RpcSessionCloseReason,
	| RpcCloseReasonEnum.gracefulShutdown
	| RpcCloseReasonEnum.forcedClose
	| RpcCloseReasonEnum.shutdownDeadline
	| RpcCloseReasonEnum.remoteTerminated
>;

type RpcUnavailableSessionFailureReason = Extract<
	RpcSessionCloseReason,
	RpcCloseReasonEnum.recoveryExpired | RpcCloseReasonEnum.counterExhaustion
>;

type RpcProtocolSessionFailureReason = Extract<
	RpcSessionCloseReason,
	RpcCloseReasonEnum.continuityFailure | RpcProtocolFaultReason
>;

type RpcSessionClosedState =
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason: RpcNormalSessionCloseReason;
	  }
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcUnavailableSessionFailureReason;
			readonly error: RpcException & {
				readonly code: RpcExceptionCodeEnum.unavailable;
			};
	  }
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcProtocolSessionFailureReason;
			readonly error: RpcException & {
				readonly code: RpcExceptionCodeEnum.protocol;
			};
	  };

type RpcConnectorClosedState =
	| RpcSessionClosedState
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcCloseReasonEnum.cleanupFailed;
			readonly error: Error;
	  };

type RpcAcceptorClosedState =
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline;
	  }
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcProtocolFaultReason;
			readonly error: RpcException & {
				readonly code: RpcExceptionCodeEnum.protocol;
			};
	  }
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcCloseReasonEnum.cleanupFailed;
			readonly error: Error;
	  };
