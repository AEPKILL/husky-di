/**
 * @overview Validates and snapshots role-specific RPC runtime policy.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RPC_PROTECTED_SESSION_BYTES } from "@/constants/protocol/rpc-profile.const";
import type {
	IRpcProtocol,
	IRpcProtocolRuntimePolicy,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	RpcAcceptorOptions,
	RpcAcceptorRuntimePolicyOptions,
	RpcConnectorOptions,
	RpcConnectorRuntimePolicyOptions,
} from "@/types/rpc-caller.type";
import {
	rpcClosedOptionsPlainRecordSchema,
	rpcPlatformTimerDelaySchema,
	rpcPositiveSafeIntegerSchema,
	rpcStringSchema,
} from "@/utils/rpc-schema.util";

const mebibyte = 1024 * 1024;
const handshakeTransientBytes = 4 * mebibyte;

const defaultPolicy: IRpcProtocolRuntimePolicy = Object.freeze({
	maxSessions: 64,
	maxHandshakes: 16,
	maxApplicationWorkPerSession: 256,
	maxApplicationWorkTotal: 1_024,
	maxActiveStreamsPerSession: 16,
	maxActiveStreamsTotal: 64,
	maxRetainedBytesPerSession: 32 * mebibyte,
	maxRetainedBytesTotal: 64 * mebibyte,
	maxHandlersPerSession: 16,
	maxHandlersTotal: 64,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 30_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
});

const policyKeys = Object.freeze(
	Object.keys(defaultPolicy) as (keyof IRpcProtocolRuntimePolicy)[],
);

const connectorPolicyKeys = new Set<keyof IRpcProtocolRuntimePolicy>([
	"maxApplicationWorkPerSession",
	"maxActiveStreamsPerSession",
	"maxRetainedBytesPerSession",
	"maxHandlersPerSession",
	"ackDelayMs",
	"activityProbeIntervalMs",
	"silenceTimeoutMs",
	"sendProgressTimeoutMs",
	"bindingAttemptTimeoutMs",
	"recoveryGraceMs",
	"shutdownDeadlineMs",
]);

const timingPolicyKeys = new Set<keyof IRpcProtocolRuntimePolicy>([
	"ackDelayMs",
	"activityProbeIntervalMs",
	"silenceTimeoutMs",
	"sendProgressTimeoutMs",
	"bindingAttemptTimeoutMs",
	"recoveryGraceMs",
	"shutdownDeadlineMs",
]);

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return rpcClosedOptionsPlainRecordSchema.safeParse(value).success;
}

export function readRpcClosedOptionsRecord(
	value: unknown,
	allowedKeys: ReadonlySet<string>,
	label: string,
): Readonly<Record<string, unknown>> {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${label} must be a plain record.`);
	}

	const snapshot = Object.create(null) as Record<string, unknown>;
	for (const key of Reflect.ownKeys(value)) {
		const keyResult = rpcStringSchema.safeParse(key);
		if (!keyResult.success || !allowedKeys.has(keyResult.data)) {
			throw new TypeError(`${label} contains an unknown option.`);
		}
		const optionKey = keyResult.data;

		const descriptor = Object.getOwnPropertyDescriptor(value, optionKey);
		// Policy options must be enumerable data properties to avoid accessor effects.
		const optionDescriptorIsInvalid =
			descriptor === undefined ||
			!descriptor.enumerable ||
			!("value" in descriptor);
		if (optionDescriptorIsInvalid) {
			throw new TypeError(
				`${label} options must be enumerable data properties.`,
			);
		}

		snapshot[optionKey] = descriptor.value;
	}

	return Object.freeze(snapshot);
}

function multiplySafe(left: number, right: number, label: string): number {
	const result = left * right;
	if (!Number.isSafeInteger(result)) {
		throw new TypeError(`${label} exceeds safe-integer arithmetic.`);
	}
	return result;
}

function addSafe(left: number, right: number, label: string): number {
	const result = left + right;
	if (!Number.isSafeInteger(result)) {
		throw new TypeError(`${label} exceeds safe-integer arithmetic.`);
	}
	return result;
}

export function validateRpcPositiveSafeInteger(
	value: unknown,
	key: string,
): number {
	if (!rpcPositiveSafeIntegerSchema.safeParse(value).success) {
		throw new TypeError(`${key} must be a positive safe integer.`);
	}
	return value as number;
}

function validatePolicy(policy: IRpcProtocolRuntimePolicy): void {
	for (const key of policyKeys) {
		const value = validateRpcPositiveSafeInteger(policy[key], key);
		// Timer-backed policy values must also fit the platform timer range.
		const exceedsPlatformTimerLimit =
			timingPolicyKeys.has(key) &&
			!rpcPlatformTimerDelaySchema.safeParse(value).success;
		if (exceedsPlatformTimerLimit) {
			throw new TypeError(
				`${key} must not exceed the platform timer delay limit.`,
			);
		}
	}

	const threeProbeIntervals = multiplySafe(
		policy.activityProbeIntervalMs,
		3,
		"silenceTimeoutMs",
	);
	if (policy.silenceTimeoutMs < threeProbeIntervals) {
		throw new TypeError(
			"silenceTimeoutMs must be at least three activity probe intervals.",
		);
	}
	if (policy.ackDelayMs > policy.activityProbeIntervalMs) {
		throw new TypeError("ackDelayMs must not exceed activityProbeIntervalMs.");
	}
	if (policy.bindingAttemptTimeoutMs > policy.recoveryGraceMs) {
		throw new TypeError(
			"bindingAttemptTimeoutMs must not exceed recoveryGraceMs.",
		);
	}
	if (policy.maxHandlersTotal < policy.maxHandlersPerSession) {
		throw new TypeError(
			"maxHandlersTotal must cover one full Session handler allowance.",
		);
	}
	if (policy.maxRetainedBytesPerSession < 4 * mebibyte) {
		throw new TypeError("maxRetainedBytesPerSession must be at least 4 MiB.");
	}

	if (policy.maxApplicationWorkPerSession > 256) {
		throw new TypeError("maxApplicationWorkPerSession must not exceed 256.");
	}
	if (policy.maxApplicationWorkTotal < policy.maxApplicationWorkPerSession) {
		throw new TypeError(
			"maxApplicationWorkTotal must cover one full Session Application Work allowance.",
		);
	}
	if (policy.maxActiveStreamsPerSession > policy.maxApplicationWorkPerSession) {
		throw new TypeError(
			"maxActiveStreamsPerSession must not exceed maxApplicationWorkPerSession.",
		);
	}
	if (policy.maxActiveStreamsTotal < policy.maxActiveStreamsPerSession) {
		throw new TypeError(
			"maxActiveStreamsTotal must cover one full Session Active Stream allowance.",
		);
	}
	if (policy.maxActiveStreamsTotal > policy.maxApplicationWorkTotal) {
		throw new TypeError(
			"maxActiveStreamsTotal must not exceed maxApplicationWorkTotal.",
		);
	}

	multiplySafe(policy.maxApplicationWorkPerSession, 4, "replay entry limit");
	addSafe(
		policy.maxSessions,
		multiplySafe(policy.maxHandshakes, 2, "Connection limit"),
		"Connection limit",
	);
	multiplySafe(
		policy.maxHandshakes,
		handshakeTransientBytes,
		"handshake transient budget",
	);

	const otherSessionReserves = multiplySafe(
		policy.maxSessions - 1,
		RPC_PROTECTED_SESSION_BYTES,
		"aggregate retained-state minimum",
	);
	const aggregateMinimum = addSafe(
		otherSessionReserves,
		policy.maxRetainedBytesPerSession,
		"aggregate retained-state minimum",
	);
	if (policy.maxRetainedBytesTotal < aggregateMinimum) {
		throw new TypeError(
			"maxRetainedBytesTotal cannot cover one full Session and sibling reserves.",
		);
	}
}

function snapshotPolicy(
	overrides: unknown,
	allowedKeys: ReadonlySet<string>,
	derivedConnectorFields: boolean,
): IRpcProtocolRuntimePolicy {
	const record =
		overrides === undefined
			? Object.freeze(Object.create(null) as Record<string, unknown>)
			: readRpcClosedOptionsRecord(overrides, allowedKeys, "runtimePolicy");
	const mutable = { ...defaultPolicy };

	for (const key of policyKeys) {
		const override = record[key];
		if (override !== undefined) {
			mutable[key] = validateRpcPositiveSafeInteger(override, key);
		}
	}
	if (record.maxActiveStreamsPerSession === undefined) {
		mutable.maxActiveStreamsPerSession = Math.min(
			16,
			mutable.maxApplicationWorkPerSession,
		);
	}

	if (derivedConnectorFields) {
		mutable.maxSessions = 1;
		mutable.maxHandshakes = 1;
		mutable.maxApplicationWorkTotal = mutable.maxApplicationWorkPerSession;
		mutable.maxActiveStreamsTotal = mutable.maxActiveStreamsPerSession;
		mutable.maxRetainedBytesTotal = mutable.maxRetainedBytesPerSession;
		mutable.maxHandlersTotal = mutable.maxHandlersPerSession;
	} else if (record.maxActiveStreamsTotal === undefined) {
		mutable.maxActiveStreamsTotal = Math.min(
			mutable.maxApplicationWorkTotal,
			Math.max(mutable.maxActiveStreamsPerSession, 64),
		);
	}

	validatePolicy(mutable);
	return Object.freeze(mutable);
}

type RpcFactoryOptionsSnapshot<
	TOptions extends RpcConnectorOptions | RpcAcceptorOptions,
> = {
	readonly protocol: IRpcProtocol | undefined;
	readonly runtimePolicy: TOptions["runtimePolicy"] | undefined;
};

export function snapshotRpcFactoryOptions<
	TOptions extends RpcConnectorOptions | RpcAcceptorOptions,
>(options: TOptions | undefined): RpcFactoryOptionsSnapshot<TOptions> {
	if (options === undefined) {
		return Object.freeze({ protocol: undefined, runtimePolicy: undefined });
	}

	const record = readRpcClosedOptionsRecord(
		options,
		new Set(["protocol", "runtimePolicy"]),
		"options",
	);
	return Object.freeze({
		protocol: record.protocol as IRpcProtocol | undefined,
		runtimePolicy: record.runtimePolicy as
			| TOptions["runtimePolicy"]
			| undefined,
	});
}

export function createRpcConnectorRuntimePolicy(
	overrides: RpcConnectorRuntimePolicyOptions | undefined,
): IRpcProtocolRuntimePolicy {
	return snapshotPolicy(overrides, connectorPolicyKeys, true);
}

export function createRpcAcceptorRuntimePolicy(
	overrides: RpcAcceptorRuntimePolicyOptions | undefined,
): IRpcProtocolRuntimePolicy {
	return snapshotPolicy(overrides, new Set(policyKeys), false);
}
