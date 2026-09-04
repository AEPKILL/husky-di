/**
 * @overview Runtime policy schemas and their derived caller and materialized types.
 * @author AEPKILL
 * @created 2026-09-04 22:24:00
 */

import { type input, type output, z } from "zod";
import { RPC_PROTECTED_SESSION_BYTES } from "@/constants/protocol/rpc-profile.const";
import {
	DEFAULT_RPC_RUNTIME_POLICY,
	RPC_HANDSHAKE_TRANSIENT_BYTES,
	RPC_MAX_PLATFORM_TIMER_DELAY_MS,
	RPC_MIN_RETAINED_BYTES_PER_SESSION,
} from "@/constants/protocol/rpc-runtime-policy.const";

export type RpcAcceptorRuntimePolicyOptions = Readonly<
	input<typeof rpcAcceptorRuntimePolicyOptionsSchema>
>;

export type RpcConnectorRuntimePolicyOptions = Readonly<
	input<typeof rpcConnectorRuntimePolicyOptionsSchema>
>;

export type RpcAcceptorRuntimePolicyOptionsSnapshot = Readonly<
	output<typeof rpcAcceptorRuntimePolicyOptionsSchema>
>;

export type RpcConnectorRuntimePolicyOptionsSnapshot = Readonly<
	output<typeof rpcConnectorRuntimePolicyOptionsSchema>
>;

export type RpcProtocolRuntimePolicy = Readonly<
	output<typeof rpcProtocolRuntimePolicySchema>
>;

export {
	rpcAcceptorRuntimePolicyOptionsSchema,
	rpcConnectorRuntimePolicyOptionsSchema,
	rpcProtocolRuntimePolicySchema,
};

const rpcPositiveSafeIntegerOptionSchema = z.number().safe().positive();

const rpcTimerOptionSchema = rpcPositiveSafeIntegerOptionSchema.max(
	RPC_MAX_PLATFORM_TIMER_DELAY_MS,
);

const rpcRuntimePolicyOptionsObjectSchema = z.strictObject({
	maxSessions: rpcPositiveSafeIntegerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.maxSessions,
	),
	maxHandshakes: rpcPositiveSafeIntegerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.maxHandshakes,
	),
	maxPendingInvocationsPerSession: rpcPositiveSafeIntegerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.maxPendingInvocationsPerSession,
	),
	maxRetainedBytesPerSession: rpcPositiveSafeIntegerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.maxRetainedBytesPerSession,
	),
	maxRetainedBytesTotal: rpcPositiveSafeIntegerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.maxRetainedBytesTotal,
	),
	maxHandlersPerSession: rpcPositiveSafeIntegerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.maxHandlersPerSession,
	),
	maxHandlersTotal: rpcPositiveSafeIntegerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.maxHandlersTotal,
	),
	ackDelayMs: rpcTimerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.ackDelayMs,
	),
	activityProbeIntervalMs: rpcTimerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.activityProbeIntervalMs,
	),
	silenceTimeoutMs: rpcTimerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.silenceTimeoutMs,
	),
	sendProgressTimeoutMs: rpcTimerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.sendProgressTimeoutMs,
	),
	bindingAttemptTimeoutMs: rpcTimerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.bindingAttemptTimeoutMs,
	),
	recoveryGraceMs: rpcTimerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.recoveryGraceMs,
	),
	shutdownDeadlineMs: rpcTimerOptionSchema.prefault(
		DEFAULT_RPC_RUNTIME_POLICY.shutdownDeadlineMs,
	),
});

const rpcAcceptorRuntimePolicyOptionsSchema = z
	.custom<input<typeof rpcRuntimePolicyOptionsObjectSchema>>()
	.transform((source) => ({
		source,
		ownKeys: Object.keys(Object(source)),
	}))
	.pipe(
		z.object({
			source: rpcRuntimePolicyOptionsObjectSchema,
			ownKeys: z.array(rpcRuntimePolicyOptionsObjectSchema.keyof()),
		}),
	)
	.transform(({ source }) => source)
	.readonly();

const rpcConnectorRuntimePolicyOptionsObjectSchema =
	rpcRuntimePolicyOptionsObjectSchema.pick({
		maxPendingInvocationsPerSession: true,
		maxRetainedBytesPerSession: true,
		maxHandlersPerSession: true,
		ackDelayMs: true,
		activityProbeIntervalMs: true,
		silenceTimeoutMs: true,
		sendProgressTimeoutMs: true,
		bindingAttemptTimeoutMs: true,
		recoveryGraceMs: true,
		shutdownDeadlineMs: true,
	});

const rpcConnectorRuntimePolicyOptionsSchema = z
	.custom<input<typeof rpcConnectorRuntimePolicyOptionsObjectSchema>>()
	.transform((source) => ({
		source,
		ownKeys: Object.keys(Object(source)),
	}))
	.pipe(
		z.object({
			source: rpcConnectorRuntimePolicyOptionsObjectSchema,
			ownKeys: z.array(rpcConnectorRuntimePolicyOptionsObjectSchema.keyof()),
		}),
	)
	.transform(({ source }) => source)
	.readonly();

const rpcProtocolRuntimePolicySchema = z
	.strictObject({
		maxSessions: rpcPositiveSafeIntegerOptionSchema,
		maxHandshakes: rpcPositiveSafeIntegerOptionSchema,
		maxPendingInvocationsPerSession: rpcPositiveSafeIntegerOptionSchema,
		maxRetainedBytesPerSession: rpcPositiveSafeIntegerOptionSchema,
		maxRetainedBytesTotal: rpcPositiveSafeIntegerOptionSchema,
		maxHandlersPerSession: rpcPositiveSafeIntegerOptionSchema,
		maxHandlersTotal: rpcPositiveSafeIntegerOptionSchema,
		ackDelayMs: rpcTimerOptionSchema,
		activityProbeIntervalMs: rpcTimerOptionSchema,
		silenceTimeoutMs: rpcTimerOptionSchema,
		sendProgressTimeoutMs: rpcTimerOptionSchema,
		bindingAttemptTimeoutMs: rpcTimerOptionSchema,
		recoveryGraceMs: rpcTimerOptionSchema,
		shutdownDeadlineMs: rpcTimerOptionSchema,
	})
	.superRefine((policy, context) => {
		const threeProbeIntervals = policy.activityProbeIntervalMs * 3;
		if (
			!Number.isSafeInteger(threeProbeIntervals) ||
			policy.silenceTimeoutMs < threeProbeIntervals
		) {
			context.addIssue({
				code: "custom",
				path: ["silenceTimeoutMs"],
				message:
					"silenceTimeoutMs must be at least three activity probe intervals.",
			});
		}
		if (policy.ackDelayMs > policy.activityProbeIntervalMs) {
			context.addIssue({
				code: "custom",
				path: ["ackDelayMs"],
				message: "ackDelayMs must not exceed activityProbeIntervalMs.",
			});
		}
		if (policy.bindingAttemptTimeoutMs > policy.recoveryGraceMs) {
			context.addIssue({
				code: "custom",
				path: ["bindingAttemptTimeoutMs"],
				message: "bindingAttemptTimeoutMs must not exceed recoveryGraceMs.",
			});
		}
		if (policy.maxHandlersTotal < policy.maxHandlersPerSession) {
			context.addIssue({
				code: "custom",
				path: ["maxHandlersTotal"],
				message:
					"maxHandlersTotal must cover one full Session handler allowance.",
			});
		}
		if (
			policy.maxRetainedBytesPerSession < RPC_MIN_RETAINED_BYTES_PER_SESSION
		) {
			context.addIssue({
				code: "custom",
				path: ["maxRetainedBytesPerSession"],
				message: "maxRetainedBytesPerSession must be at least 4 MiB.",
			});
		}
		if (!Number.isSafeInteger(policy.maxPendingInvocationsPerSession * 4)) {
			context.addIssue({
				code: "custom",
				path: ["maxPendingInvocationsPerSession"],
				message: "replay entry limit exceeds safe-integer arithmetic.",
			});
		}
		if (!Number.isSafeInteger(policy.maxSessions + policy.maxHandshakes * 2)) {
			context.addIssue({
				code: "custom",
				path: ["maxHandshakes"],
				message: "Connection limit exceeds safe-integer arithmetic.",
			});
		}
		if (
			!Number.isSafeInteger(
				policy.maxHandshakes * RPC_HANDSHAKE_TRANSIENT_BYTES,
			)
		) {
			context.addIssue({
				code: "custom",
				path: ["maxHandshakes"],
				message: "handshake transient budget exceeds safe-integer arithmetic.",
			});
		}

		const aggregateMinimum =
			(policy.maxSessions - 1) * RPC_PROTECTED_SESSION_BYTES +
			policy.maxRetainedBytesPerSession;
		if (!Number.isSafeInteger(aggregateMinimum)) {
			context.addIssue({
				code: "custom",
				path: ["maxSessions"],
				message:
					"aggregate retained-state minimum exceeds safe-integer arithmetic.",
			});
		} else if (policy.maxRetainedBytesTotal < aggregateMinimum) {
			context.addIssue({
				code: "custom",
				path: ["maxRetainedBytesTotal"],
				message:
					"maxRetainedBytesTotal cannot cover one full Session and sibling reserves.",
			});
		}
	})
	.readonly();
