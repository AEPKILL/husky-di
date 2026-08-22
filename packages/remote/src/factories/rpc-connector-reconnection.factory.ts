/**
 * @overview Creates an opt-in Connector Reconnection supervisor.
 * @author AEPKILL
 * @created 2026-08-21 02:14:00
 */

import {
	DEFAULT_RPC_CONNECTOR_RECONNECTION_ATTEMPT_TIMEOUT_MS,
	DEFAULT_RPC_CONNECTOR_RECONNECTION_RETRY_DELAYS_MS,
} from "@/constants/rpc-connector-reconnection.const";
import { RpcConnectorReconnectionImpl } from "@/impls/rpc-connector-reconnection.impl";
import type { IRpcConnector } from "@/interfaces/rpc-caller.interface";
import type { IRpcConnectorReconnection } from "@/interfaces/rpc-connector-reconnection.interface";
import type {
	CreateRpcConnectorReconnectionOptions,
	RpcConnectorAdapterFactory,
	RpcConnectorReconnectionPolicy,
} from "@/types/rpc-connector-reconnection.type";
import {
	readRpcClosedOptionsRecord,
	validateRpcPositiveSafeInteger,
} from "@/utils/rpc-runtime-policy.util";
import {
	rpcArrayBrandSchema,
	rpcCallableSchema,
	rpcNonNullObjectSchema,
	rpcNullSchema,
	rpcObjectOrFunctionSchema,
	rpcObjectTypeSchema,
	rpcRetryDelayCountSchema,
	rpcRetryDelaySchema,
} from "@/utils/rpc-schema.util";

const optionKeys = new Set(["connector", "adapterFactory", "policy"]);
const policyKeys = new Set(["retryDelaysMs", "attemptTimeoutMs"]);

function hasObservableShape(value: unknown): boolean {
	if (!rpcObjectOrFunctionSchema.safeParse(value).success) {
		return false;
	}
	return rpcCallableSchema.safeParse(Reflect.get(value as object, "subscribe"))
		.success;
}

function validateConnector(value: unknown): asserts value is IRpcConnector {
	if (!rpcNonNullObjectSchema.safeParse(value).success) {
		throw new TypeError("connector must be an object.");
	}
	const connector = value as object;
	const peer = Reflect.get(connector, "peer") as unknown;
	const state = Reflect.get(connector, "state") as unknown;
	// Preserve the legacy short-circuit reads for potentially accessor-backed SPI objects.
	if (
		!rpcCallableSchema.safeParse(Reflect.get(connector, "connect")).success ||
		!rpcNonNullObjectSchema.safeParse(state).success ||
		!hasObservableShape(Reflect.get(connector, "state$")) ||
		!rpcNonNullObjectSchema.safeParse(peer).success ||
		!rpcObjectTypeSchema.safeParse(Reflect.get(peer as object, "state"))
			.success ||
		rpcNullSchema.safeParse(Reflect.get(peer as object, "state")).success ||
		!hasObservableShape(Reflect.get(peer as object, "state$"))
	) {
		throw new TypeError("connector has an invalid shape.");
	}
}

function snapshotRetryDelays(value: unknown): readonly number[] {
	if (!rpcArrayBrandSchema.safeParse(value).success) {
		throw new TypeError("retryDelaysMs must contain at most 64 delays.");
	}
	const delays = value as readonly unknown[];
	const length = Reflect.get(delays, "length") as unknown;
	if (!rpcRetryDelayCountSchema.safeParse(length).success) {
		throw new TypeError("retryDelaysMs must contain at most 64 delays.");
	}
	const snapshot: number[] = [];
	for (let index = 0; index < (length as number); index += 1) {
		const descriptor = Reflect.getOwnPropertyDescriptor(delays, `${index}`);
		if (
			descriptor === undefined ||
			!("value" in descriptor) ||
			!rpcRetryDelaySchema.safeParse(descriptor.value).success
		) {
			throw new TypeError(
				"retryDelaysMs must contain non-negative safe integers.",
			);
		}
		snapshot.push(descriptor.value as number);
	}
	return Object.freeze(snapshot);
}

/** Creates a cold, single-use Connector Reconnection supervisor. */
export function createRpcConnectorReconnection(
	options: CreateRpcConnectorReconnectionOptions,
): IRpcConnectorReconnection {
	const record = readRpcClosedOptionsRecord(options, optionKeys, "options");
	const connector = record.connector;
	validateConnector(connector);
	const adapterFactory = record.adapterFactory;
	if (!rpcCallableSchema.safeParse(adapterFactory).success) {
		throw new TypeError("adapterFactory must be a function.");
	}
	const policyRecord =
		record.policy === undefined
			? Object.freeze(Object.create(null) as Record<string, unknown>)
			: readRpcClosedOptionsRecord(record.policy, policyKeys, "policy");
	const retryDelaysMs = snapshotRetryDelays(
		policyRecord.retryDelaysMs ??
			DEFAULT_RPC_CONNECTOR_RECONNECTION_RETRY_DELAYS_MS,
	);
	const policy = Object.freeze<RpcConnectorReconnectionPolicy>({
		retryDelaysMs,
		attemptTimeoutMs:
			policyRecord.attemptTimeoutMs === undefined
				? DEFAULT_RPC_CONNECTOR_RECONNECTION_ATTEMPT_TIMEOUT_MS
				: validateRpcPositiveSafeInteger(
						policyRecord.attemptTimeoutMs,
						"attemptTimeoutMs",
					),
	});
	return new RpcConnectorReconnectionImpl(
		connector,
		adapterFactory as RpcConnectorAdapterFactory,
		policy,
	);
}
