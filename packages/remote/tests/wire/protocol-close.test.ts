/**
 * @overview Default Protocol active Close wire-shape validation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { describe, expect, it } from "vitest";

import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";

const encoder = new TextEncoder();
const codec = new RpcCodecImpl();

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
		expect(() =>
			codec.decode(
				encoder.encode(JSON.stringify({ kind: "close", [field]: null })),
				"active",
			),
		).toThrow("RPC close contains a forbidden control member.");
	});

	it("RPC-WIRE-005 RPC-WIRE-015 accepts and ignores a bounded unknown Close tail", () => {
		const record = codec.decode(
			encoder.encode(JSON.stringify({ kind: "close", future: true })),
			"active",
		);

		expect(record).toMatchObject({
			kind: "close",
			future: true,
		});
	});
});
