/**
 * @overview Connector Reconnection schemas and caller-facing data types.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import { type input, type output, z } from "zod";

import {
	DEFAULT_RPC_CONNECTOR_RECONNECTION_ATTEMPT_TIMEOUT_MS,
	DEFAULT_RPC_CONNECTOR_RECONNECTION_RETRY_DELAYS_MS,
} from "@/constants/rpc-connector-reconnection.const";
import type { RpcConnectorReconnectionAttemptFailureStageEnum } from "@/enums/rpc-connector-reconnection-attempt-failure-stage.enum";
import type { RpcConnectorReconnectionEventTypeEnum } from "@/enums/rpc-connector-reconnection-event-type.enum";
import type { RpcConnectorReconnectionStopReasonEnum } from "@/enums/rpc-connector-reconnection-stop-reason.enum";
import type { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
import type { IRpcConnectorAdapter } from "@/interfaces/transport/rpc-adapter.interface";

export type RpcConnectorAdapterFactory = output<
	typeof rpcConnectorAdapterFactorySchema
>;

export type RpcConnectorReconnectionPolicyOptions = Readonly<
	input<typeof rpcConnectorReconnectionPolicySchema>
>;

export type RpcConnectorReconnectionPolicy = Readonly<
	output<typeof rpcConnectorReconnectionPolicySchema>
>;

export type CreateRpcConnectorReconnectionOptions = Readonly<
	input<typeof rpcConnectorReconnectionOptionsSchema>
>;

export type RpcConnectorReconnectionState =
	| { readonly status: RpcStateStatusEnum.idle }
	| { readonly status: RpcStateStatusEnum.connecting }
	| { readonly status: RpcStateStatusEnum.monitoring }
	| {
			readonly status: RpcStateStatusEnum.reconnecting;
			readonly attempt: number;
	  }
	| {
			readonly status: RpcStateStatusEnum.waiting;
			readonly nextAttempt: number;
			readonly delayMs: number;
	  }
	| {
			readonly status: RpcStateStatusEnum.stopped;
			readonly reason: RpcConnectorReconnectionStopReasonEnum;
	  };

export type RpcConnectorReconnectionEvent = {
	readonly type: RpcConnectorReconnectionEventTypeEnum.attemptFailed;
	readonly attempt: number;
	readonly stage: RpcConnectorReconnectionAttemptFailureStageEnum;
	readonly nextDelayMs?: number;
};

export const rpcConnectorAdapterFactorySchema = z.custom<
	() => IRpcConnectorAdapter
>((value) => typeof value === "function");

export const rpcConnectorReconnectionObservableShapeSchema = z.custom<
	Readonly<{ subscribe: (...args: never[]) => unknown }>
>(
	(value) =>
		((typeof value === "object" && value !== null) ||
			typeof value === "function") &&
		typeof Reflect.get(value as object, "subscribe") === "function",
);

export const rpcConnectorReconnectionConnectorShapeSchema = z.object({
	connect: z.function(),
	state: z.object({}),
	state$: rpcConnectorReconnectionObservableShapeSchema,
	peer: z.object({
		state: z.object({}),
		state$: rpcConnectorReconnectionObservableShapeSchema,
	}),
});

export const rpcConnectorReconnectionConnectorSchema = z.custom<IRpcConnector>(
	(value) =>
		rpcConnectorReconnectionConnectorShapeSchema.safeParse(value).success,
);

export const rpcConnectorReconnectionNonNegativeSafeIntegerSchema = z
	.number()
	.safe()
	.nonnegative();

export const rpcConnectorReconnectionPositiveSafeIntegerSchema = z
	.number()
	.safe()
	.positive();

export const rpcConnectorReconnectionRetryDelaysSchema = z
	.custom<readonly number[]>((value) => Array.isArray(value))
	.transform((value, context) => {
		const length = Reflect.get(value, "length") as unknown;
		if (
			typeof length !== "number" ||
			!Number.isSafeInteger(length) ||
			length < 0 ||
			length > 64
		) {
			context.addIssue({
				code: "custom",
				message: "retryDelaysMs must contain at most 64 delays.",
			});
			return z.NEVER;
		}
		return Array.from({ length }, (_unused, index) =>
			Reflect.get(value, `${index}`),
		);
	})
	.pipe(z.array(rpcConnectorReconnectionNonNegativeSafeIntegerSchema))
	.readonly();

export const rpcConnectorReconnectionPolicyObjectSchema = z.strictObject({
	retryDelaysMs: rpcConnectorReconnectionRetryDelaysSchema.prefault(
		DEFAULT_RPC_CONNECTOR_RECONNECTION_RETRY_DELAYS_MS,
	),
	attemptTimeoutMs: rpcConnectorReconnectionPositiveSafeIntegerSchema.prefault(
		DEFAULT_RPC_CONNECTOR_RECONNECTION_ATTEMPT_TIMEOUT_MS,
	),
});

export const rpcConnectorReconnectionPolicySchema = z
	.custom<input<typeof rpcConnectorReconnectionPolicyObjectSchema>>()
	.transform((source) => ({
		source,
		ownKeys: Object.keys(Object(source)),
	}))
	.pipe(
		z.object({
			source: rpcConnectorReconnectionPolicyObjectSchema,
			ownKeys: z.array(rpcConnectorReconnectionPolicyObjectSchema.keyof()),
		}),
	)
	.transform(({ source }) => source)
	.readonly();

export const rpcConnectorReconnectionOptionsObjectSchema = z.strictObject({
	connector: rpcConnectorReconnectionConnectorSchema,
	adapterFactory: rpcConnectorAdapterFactorySchema,
	policy: rpcConnectorReconnectionPolicySchema.prefault({}),
});

export const rpcConnectorReconnectionOptionsSchema = z
	.custom<input<typeof rpcConnectorReconnectionOptionsObjectSchema>>()
	.transform((source) => ({
		source,
		ownKeys: Object.keys(Object(source)),
	}))
	.pipe(
		z.object({
			source: rpcConnectorReconnectionOptionsObjectSchema,
			ownKeys: z.array(rpcConnectorReconnectionOptionsObjectSchema.keyof()),
		}),
	)
	.transform(({ source }) => source)
	.readonly();
