/**
 * @overview Default Protocol active Close wire-shape validation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { describe, expect, it } from "vitest";

import {
	decodeDefaultRpcRecord,
	validateDefaultRpcActiveRecord,
} from "../../src/protocols/default/default-rpc-codec.util";

const encoder = new TextEncoder();

describe("Default RPC Protocol Close wire shape", () => {
	it.each([
		"seq",
		"ackThrough",
		"profile",
		"profiles",
		"sessionId",
		"bindingEpoch",
		"resumeAttempt",
		"receivedThrough",
		"initiatorNonce",
		"responderNonce",
		"sessionSecret",
		"proof",
		"callId",
		"service",
		"method",
		"args",
		"value",
		"error",
		"code",
		"message",
		"reason",
	] as const)("RPC-WIRE-015 rejects Close carrying the known %s field", (field) => {
		const record = decodeDefaultRpcRecord(
			encoder.encode(JSON.stringify({ kind: "close", [field]: null })),
		);

		expect(() => validateDefaultRpcActiveRecord(record)).toThrow(
			"RPC close contains a forbidden control member.",
		);
	});

	it("RPC-WIRE-005 RPC-WIRE-015 accepts and ignores a bounded unknown Close tail", () => {
		const record = decodeDefaultRpcRecord(
			encoder.encode(JSON.stringify({ kind: "close", future: true })),
		);

		expect(validateDefaultRpcActiveRecord(record)).toMatchObject({
			kind: "close",
			future: true,
		});
	});
});
