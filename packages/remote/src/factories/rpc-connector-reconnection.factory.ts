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

const optionKeys = new Set(["connector", "adapterFactory", "policy"]);
const policyKeys = new Set(["retryDelaysMs", "attemptTimeoutMs"]);

function hasObservableShape(value: unknown): boolean {
	return (typeof value === "object" && value !== null) ||
		typeof value === "function"
		? typeof Reflect.get(value, "subscribe") === "function"
		: false;
}

function validateConnector(value: unknown): asserts value is IRpcConnector {
	if (typeof value !== "object" || value === null) {
		throw new TypeError("connector must be an object.");
	}
	const peer = Reflect.get(value, "peer") as unknown;
	const state = Reflect.get(value, "state") as unknown;
	if (
		typeof Reflect.get(value, "connect") !== "function" ||
		typeof state !== "object" ||
		state === null ||
		!hasObservableShape(Reflect.get(value, "state$")) ||
		typeof peer !== "object" ||
		peer === null ||
		typeof Reflect.get(peer, "state") !== "object" ||
		Reflect.get(peer, "state") === null ||
		!hasObservableShape(Reflect.get(peer, "state$"))
	) {
		throw new TypeError("connector has an invalid shape.");
	}
}

function snapshotRetryDelays(value: unknown): readonly number[] {
	if (!Array.isArray(value)) {
		throw new TypeError("retryDelaysMs must contain at most 64 delays.");
	}
	const length = Reflect.get(value, "length") as unknown;
	if (
		!Number.isSafeInteger(length) ||
		(length as number) < 0 ||
		(length as number) > 64
	) {
		throw new TypeError("retryDelaysMs must contain at most 64 delays.");
	}
	const snapshot: number[] = [];
	for (let index = 0; index < (length as number); index += 1) {
		const descriptor = Reflect.getOwnPropertyDescriptor(value, `${index}`);
		if (
			descriptor === undefined ||
			!("value" in descriptor) ||
			!Number.isSafeInteger(descriptor.value) ||
			descriptor.value < 0
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
	if (typeof adapterFactory !== "function") {
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
