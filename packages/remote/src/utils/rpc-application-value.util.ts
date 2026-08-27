/**
 * @overview Detaches, bounds, weighs, and compares common RPC Application Values.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationRecord,
	IRpcApplicationSnapshot,
	RpcApplicationValue,
} from "@/interfaces/protocol/rpc-protocol.interface";

/** Produces the Framework-owned immutable Application Value snapshot. */
export function normalizeRpcApplicationValue(
	input: unknown,
): IRpcApplicationSnapshot {
	return wrapMetaOperationFailure(() => {
		const normalized = normalizeValue(
			input,
			{ ancestors: new Set(), nodes: 0 },
			1,
		);
		const snapshot = Object.freeze({
			value: normalized.value,
			weight: normalized.weight,
		}) as IRpcApplicationSnapshot;
		applicationSnapshots.add(snapshot);
		return snapshot;
	});
}

/** Produces an arguments snapshot and rejects non-array roots. */
export function normalizeRpcApplicationArguments(
	input: unknown,
): IRpcApplicationArgumentsSnapshot {
	if (!Array.isArray(input)) {
		throw new TypeError("RPC arguments must be an Application Value array.");
	}
	return normalizeRpcApplicationValue(
		input,
	) as IRpcApplicationArgumentsSnapshot;
}

/** Identifies an opaque snapshot created by this Framework instance. */
export function isRpcApplicationSnapshot(
	value: unknown,
): value is IRpcApplicationSnapshot {
	return (
		typeof value === "object" &&
		value !== null &&
		applicationSnapshots.has(value)
	);
}

/** Identifies a Framework snapshot whose root is an arguments array. */
export function isRpcApplicationArgumentsSnapshot(
	value: unknown,
): value is IRpcApplicationArgumentsSnapshot {
	return isRpcApplicationSnapshot(value) && Array.isArray(value.value);
}

/** Compares normalized trees by decoded semantic value. */
export function rpcApplicationValuesEqual(
	left: IRpcApplicationSnapshot,
	right: IRpcApplicationSnapshot,
): boolean {
	if (!isRpcApplicationSnapshot(left) || !isRpcApplicationSnapshot(right)) {
		throw new TypeError("Protocol supplied a forged Application snapshot.");
	}
	return valuesEqual(left.value, right.value);
}

interface NormalizationState {
	readonly ancestors: Set<object>;
	nodes: number;
}

interface NormalizedValue {
	readonly value: RpcApplicationValue;
	readonly weight: number;
}

const maximumDepth = 64;
const maximumStringBytes = 512 * 1024;
const maximumMemberNameBytes = 256;
const maximumRecordMembers = 1024;
const maximumArrayElements = 8192;
const maximumNodes = 65_536;
const maximumWeight = 1_000_000;
const textEncoder = new TextEncoder();
const applicationSnapshots = new WeakSet<object>();

function invalidValue(message: string): never {
	throw new TypeError(message);
}

function utf8Length(value: string): number {
	return textEncoder.encode(value).byteLength;
}

function assertPairedSurrogates(value: string, label: string): void {
	if (!value.isWellFormed()) {
		invalidValue(`${label} contains an unpaired surrogate.`);
	}
}

function stringWeight(
	value: string,
	maximumBytes: number,
	label: string,
): number {
	assertPairedSurrogates(value, label);
	if (utf8Length(value) > maximumBytes) {
		invalidValue(`${label} exceeds its UTF-8 limit.`);
	}

	const spelling = JSON.stringify(value);
	return utf8Length(spelling);
}

function boundedWeight(weight: number): number {
	if (weight > maximumWeight) {
		invalidValue("Application Value exceeds its compact-JSON weight limit.");
	}
	return weight;
}

function countNode(state: NormalizationState, depth: number): void {
	if (depth > maximumDepth) {
		invalidValue("Application Value exceeds its depth limit.");
	}
	state.nodes += 1;
	if (state.nodes > maximumNodes) {
		invalidValue("Application Value exceeds its node limit.");
	}
}

function withAncestor<T>(
	state: NormalizationState,
	value: object,
	operation: () => T,
): T {
	if (state.ancestors.has(value)) {
		return invalidValue("Application Value contains a cycle.");
	}
	state.ancestors.add(value);
	try {
		return operation();
	} finally {
		state.ancestors.delete(value);
	}
}

function normalizeArray(
	input: readonly unknown[],
	state: NormalizationState,
	depth: number,
): NormalizedValue {
	const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
	// Array length must be a non-negative safe integer stored as a data property.
	const lengthDescriptorIsInvalid =
		lengthDescriptor === undefined ||
		!("value" in lengthDescriptor) ||
		typeof lengthDescriptor.value !== "number" ||
		!Number.isSafeInteger(lengthDescriptor.value) ||
		lengthDescriptor.value < 0;
	if (lengthDescriptorIsInvalid) {
		return invalidValue("Application Value array has an invalid length.");
	}
	const length = lengthDescriptor.value;
	if (length > maximumArrayElements) {
		return invalidValue("Application Value array exceeds its element limit.");
	}

	return withAncestor(state, input, () => {
		const keys = Reflect.ownKeys(input);
		for (const key of keys) {
			if (typeof key === "symbol") {
				return invalidValue(
					"Application Value arrays cannot have symbol keys.",
				);
			}
			const descriptor = Object.getOwnPropertyDescriptor(input, key);
			if (descriptor === undefined || !("value" in descriptor)) {
				return invalidValue("Application Value arrays cannot have accessors.");
			}
			if (key === "length") {
				continue;
			}
			const index = Number(key);
			// Every non-length array key must be a canonical in-range index.
			const keyIsNotArrayIndex =
				!Number.isInteger(index) ||
				index < 0 ||
				String(index) !== key ||
				index >= length;
			if (keyIsNotArrayIndex) {
				return invalidValue(
					"Application Value arrays cannot have non-index properties.",
				);
			}
		}

		const output: RpcApplicationValue[] = [];
		let weight = 2;
		for (let index = 0; index < length; index += 1) {
			const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
			// Dense Application Value arrays require an enumerable data property per index.
			const elementDescriptorIsInvalid =
				descriptor === undefined ||
				!("value" in descriptor) ||
				!descriptor.enumerable;
			if (elementDescriptorIsInvalid) {
				return invalidValue(
					"Application Value arrays must be dense data arrays.",
				);
			}
			const child = normalizeValue(descriptor.value, state, depth + 1);
			output.push(child.value);
			weight = boundedWeight(weight + child.weight + (index === 0 ? 0 : 1));
		}

		return { value: Object.freeze(output), weight };
	});
}

function normalizeRecord(
	input: object,
	state: NormalizationState,
	depth: number,
): NormalizedValue {
	const prototype = Object.getPrototypeOf(input);
	if (prototype !== Object.prototype && prototype !== null) {
		return invalidValue(
			"Application Value records must have a plain prototype.",
		);
	}

	return withAncestor(state, input, () => {
		const output = Object.create(null) as Record<string, RpcApplicationValue>;
		let memberCount = 0;
		let weight = 2;

		for (const key of Reflect.ownKeys(input)) {
			if (typeof key === "symbol") {
				return invalidValue(
					"Application Value records cannot have symbol keys.",
				);
			}
			const descriptor = Object.getOwnPropertyDescriptor(input, key);
			if (descriptor === undefined || !("value" in descriptor)) {
				return invalidValue("Application Value records cannot have accessors.");
			}
			if (!descriptor.enumerable) {
				continue;
			}

			memberCount += 1;
			if (memberCount > maximumRecordMembers) {
				return invalidValue(
					"Application Value record exceeds its member limit.",
				);
			}
			const keyWeight = stringWeight(
				key,
				maximumMemberNameBytes,
				"Application Value member name",
			);
			const child = normalizeValue(descriptor.value, state, depth + 1);
			output[key] = child.value;
			weight = boundedWeight(
				weight + keyWeight + 1 + child.weight + (memberCount === 1 ? 0 : 1),
			);
		}

		return { value: Object.freeze(output), weight };
	});
}

function normalizeValue(
	input: unknown,
	state: NormalizationState,
	depth: number,
): NormalizedValue {
	countNode(state, depth);
	if (input === null) {
		return { value: null, weight: 4 };
	}

	switch (typeof input) {
		case "boolean":
			return { value: input, weight: input ? 4 : 5 };
		case "string":
			return {
				value: input,
				weight: stringWeight(
					input,
					maximumStringBytes,
					"Application Value string",
				),
			};
		case "number": {
			if (!Number.isFinite(input) || Object.is(input, -0)) {
				return invalidValue(
					"Application Value number is not finite binary64 data.",
				);
			}
			const spelling = JSON.stringify(input);
			return { value: input, weight: spelling.length };
		}
		case "object":
			return Array.isArray(input)
				? normalizeArray(input, state, depth)
				: normalizeRecord(input, state, depth);
		default:
			return invalidValue("Value is outside the RPC Application Value domain.");
	}
}

function wrapMetaOperationFailure<T>(operation: () => T): T {
	try {
		return operation();
	} catch (error) {
		if (error instanceof TypeError) {
			throw error;
		}
		const wrapped = new TypeError(
			"Application Value inspection failed during a meta-operation.",
		);
		throw wrapped;
	}
}

function valuesEqual(
	left: RpcApplicationValue,
	right: RpcApplicationValue,
): boolean {
	if (left === right) {
		return true;
	}
	if (Array.isArray(left)) {
		if (!Array.isArray(right) || left.length !== right.length) {
			return false;
		}
		return left.every((value, index) => valuesEqual(value, right[index]));
	}
	// After the array branch, only two non-null records can still be equal.
	const valuesCannotBeRecords =
		Array.isArray(right) || typeof left !== "object" || left === null;
	if (valuesCannotBeRecords) {
		return false;
	}
	if (typeof right !== "object" || right === null) {
		return false;
	}

	const leftRecord = left as IRpcApplicationRecord;
	const rightRecord = right as IRpcApplicationRecord;
	const leftKeys = Object.keys(leftRecord);
	const rightKeys = Object.keys(rightRecord);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}
	return leftKeys.every(
		(key) =>
			Object.hasOwn(rightRecord, key) &&
			valuesEqual(leftRecord[key], rightRecord[key]),
	);
}
