/**
 * @overview Creates an opt-in Connector Reconnection supervisor.
 * @author AEPKILL
 * @created 2026-08-21 02:14:00
 */

import {
	DEFAULT_RPC_CONNECTOR_RECONNECTION_ATTEMPT_TIMEOUT_MS,
	DEFAULT_RPC_CONNECTOR_RECONNECTION_RETRY_DELAYS_MS,
} from "@/constants/rpc-connector-reconnection.const";
import { RpcConnectorReconnectionImpl } from "@/impls/reconnection/rpc-connector-reconnection.impl";
import type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
import type {
	IRpcConnectorReconnection,
	RpcConnectorAdapterFactory,
	RpcConnectorReconnectionPolicy,
	RpcConnectorReconnectionPolicyOptions,
} from "@/interfaces/reconnection/rpc-connector-reconnection.interface";
import {
	readRpcClosedOptionsRecord,
	validateRpcPositiveSafeInteger,
} from "@/utils/rpc-runtime-policy.util";
import {
	isArray,
	isCallable,
	isNonNegativeSafeInteger,
	isNonNullObject,
	isNull,
	isObjectOrFunction,
	isObjectType,
} from "@/utils/type-guard.util";

export type CreateRpcConnectorReconnectionOptions = {
	readonly connector: IRpcConnector;
	readonly adapterFactory: RpcConnectorAdapterFactory;
	readonly policy?: RpcConnectorReconnectionPolicyOptions;
};

/** Creates a cold, single-use Connector Reconnection supervisor. */
export function createRpcConnectorReconnection(
	options: CreateRpcConnectorReconnectionOptions,
): IRpcConnectorReconnection {
	const record = readRpcClosedOptionsRecord(options, optionKeys, "options");
	const connector = record.connector;
	validateConnector(connector);
	const adapterFactory = record.adapterFactory;
	if (!isCallable(adapterFactory)) {
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

const optionKeys = new Set(["connector", "adapterFactory", "policy"]);
const policyKeys = new Set(["retryDelaysMs", "attemptTimeoutMs"]);

function hasObservableShape(value: unknown): boolean {
	if (!isObjectOrFunction(value)) {
		return false;
	}
	return isCallable(Reflect.get(value, "subscribe"));
}

function isRetryDelayCount(value: unknown): value is number {
	return isNonNegativeSafeInteger(value) && value <= 64;
}

function validateConnector(value: unknown): asserts value is IRpcConnector {
	if (!isNonNullObject(value)) {
		throw new TypeError("connector must be an object.");
	}
	const connector = value as object;
	const peer = Reflect.get(connector, "peer") as unknown;
	const state = Reflect.get(connector, "state") as unknown;
	// Preserve the legacy short-circuit reads for potentially accessor-backed SPI objects.
	const connectorShapeIsInvalid =
		!isCallable(Reflect.get(connector, "connect")) ||
		!isNonNullObject(state) ||
		!hasObservableShape(Reflect.get(connector, "state$")) ||
		!isNonNullObject(peer) ||
		!isObjectType(Reflect.get(peer as object, "state")) ||
		isNull(Reflect.get(peer as object, "state")) ||
		!hasObservableShape(Reflect.get(peer as object, "state$"));
	if (connectorShapeIsInvalid) {
		throw new TypeError("connector has an invalid shape.");
	}
}

function snapshotRetryDelays(value: unknown): readonly number[] {
	if (!isArray(value)) {
		throw new TypeError("retryDelaysMs must contain at most 64 delays.");
	}
	const delays = value;
	const length = Reflect.get(delays, "length") as unknown;
	if (!isRetryDelayCount(length)) {
		throw new TypeError("retryDelaysMs must contain at most 64 delays.");
	}
	const snapshot: number[] = [];
	for (let index = 0; index < length; index += 1) {
		const descriptor = Reflect.getOwnPropertyDescriptor(delays, `${index}`);
		// Retry delays must be represented by data properties containing valid delays.
		const retryDelayIsInvalid =
			descriptor === undefined ||
			!("value" in descriptor) ||
			!isNonNegativeSafeInteger(descriptor.value);
		if (retryDelayIsInvalid) {
			throw new TypeError(
				"retryDelaysMs must contain non-negative safe integers.",
			);
		}
		snapshot.push(descriptor.value as number);
	}
	return Object.freeze(snapshot);
}
