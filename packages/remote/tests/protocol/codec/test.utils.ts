/**
 * @overview Shared protocol/rpc-codec fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { expect } from "vitest";
import { ZodError } from "zod";
import {
	RpcCodecImpl,
	type RpcDecodePhaseEnum,
} from "../../../src/modules/protocol";

export type RecordCase = readonly [
	label: string,
	phase: RpcDecodePhaseEnum,
	record: Readonly<Record<string, unknown>>,
];

export const codec = new RpcCodecImpl();

export const encoder = new TextEncoder();

export const base64Url32 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function decodeRecord(
	record: Readonly<Record<string, unknown>>,
	phase: RpcDecodePhaseEnum,
): Readonly<Record<string, unknown>> {
	return codec.decode(encodeRecord(record), phase) as Readonly<
		Record<string, unknown>
	>;
}

export function expectPlainCodecError(operation: () => unknown): Error {
	let failure: unknown;
	try {
		operation();
	} catch (error) {
		failure = error;
	}

	expect(failure).toBeInstanceOf(Error);
	expect(failure).not.toBeInstanceOf(ZodError);
	return failure as Error;
}

function encodeRecord(record: Readonly<Record<string, unknown>>): Uint8Array {
	return encoder.encode(JSON.stringify(record));
}
