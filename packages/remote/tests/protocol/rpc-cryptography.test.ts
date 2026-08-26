/**
 * @overview Internal cryptographic known-answer verification for husky-di-rpc/1.
 * @author AEPKILL
 * @created 2026-08-26 11:44:17
 */

import { createHash, createHmac, hkdfSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { RPC_PROFILE } from "../../src/constants/protocol/rpc-profile.const";
import { RpcProofOperationKindEnum } from "../../src/enums/protocol/rpc-proof-operation-kind.enum";
import { RpcResumeRejectCodeEnum } from "../../src/enums/protocol/rpc-resume-reject-code.enum";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCryptographyImpl } from "../../src/impls/protocol/rpc-cryptography.impl";
import type {
	RpcFreshAccept,
	RpcFreshRequest,
	RpcJsonRecord,
	RpcResumeAccept,
	RpcResumeReject,
	RpcResumeRequest,
} from "../../src/types/protocol/rpc-wire-record.type";

const cryptography = new RpcCryptographyImpl();
const sessionId = "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8";
const sessionSecretHex =
	"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const sessionContextCanonical =
	'{"profile":"husky-di-rpc/1","sessionId":"ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8"}';
const sessionContextSha256Hex =
	"145471d9f488ba17d756afdd76a235da2b734e8cc1b23c4c0b62edc828617879";
const proofKeyDomainHex = "6875736b792d64692d7270632f310070726f6f662d6b657900";
const proofKeyHex =
	"14f6427f2dfe04a9c0b6689e087de6d28b9c5f130b7db7a2e50eee29c3001a01";

const freshRequest: RpcFreshRequest = {
	kind: RpcWireRecordKindEnum.fresh,
	profiles: ["future/2", RPC_PROFILE],
	initiatorNonce: "QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8",
	zUnknown: { proof: "nested-kept", n: 1 },
	aUnknown: true,
};
const freshRequestCanonical =
	'{"aUnknown":true,"initiatorNonce":"QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8","kind":"fresh","profiles":["future/2","husky-di-rpc/1"],"zUnknown":{"n":1,"proof":"nested-kept"}}';
const freshAccept: RpcFreshAccept = {
	kind: RpcWireRecordKindEnum.accept,
	profile: RPC_PROFILE,
	sessionId,
	bindingEpoch: 1,
	responderNonce: "YGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn8",
	sessionSecret: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
	future: ["x"],
	proof: "IDaiGH9L4FKlDeqZr3opPKl7kTomk2yGH54TzHZYsUk",
};
const freshAcceptCanonicalWithoutProof =
	'{"bindingEpoch":1,"future":["x"],"kind":"accept","profile":"husky-di-rpc/1","responderNonce":"YGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn8","sessionId":"ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8","sessionSecret":"AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"}';
const resumeRequest: RpcResumeRequest = {
	kind: RpcWireRecordKindEnum.resume,
	profile: RPC_PROFILE,
	sessionId,
	receivedThrough: 7,
	resumeAttempt: 3,
	initiatorNonce: "gIGCg4SFhoeIiYqLjI2Oj5CRkpOUlZaXmJmam5ydnp8",
	future: { proof: "nested-kept", mode: "resume" },
	proof: "AayJUaWcyWV0egPR_oLFNQqS1MDjsfrxZSUd_EJhFkY",
};
const resumeRequestCanonicalWithoutProof =
	'{"future":{"mode":"resume","proof":"nested-kept"},"initiatorNonce":"gIGCg4SFhoeIiYqLjI2Oj5CRkpOUlZaXmJmam5ydnp8","kind":"resume","profile":"husky-di-rpc/1","receivedThrough":7,"resumeAttempt":3,"sessionId":"ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8"}';
const resumeAccept: RpcResumeAccept = {
	kind: RpcWireRecordKindEnum.accept,
	profile: RPC_PROFILE,
	sessionId,
	bindingEpoch: 4,
	receivedThrough: 5,
	responderNonce: "oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8",
	future: false,
	proof: "OthHLT7z2teQRj3PNgqOwUTdFFANwCZNP5_zt476Vtc",
};
const resumeAcceptCanonicalWithoutProof =
	'{"bindingEpoch":4,"future":false,"kind":"accept","profile":"husky-di-rpc/1","receivedThrough":5,"responderNonce":"oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8","sessionId":"ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8"}';
const authenticatedReject: RpcResumeReject = {
	kind: RpcWireRecordKindEnum.reject,
	code: RpcResumeRejectCodeEnum.continuityFailure,
	responderNonce: "wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t8",
	future: { proof: "nested-kept" },
	proof: "UN4tSL-lWsIBo7XzUR9aM3HFG6m-ZPpPEwei6HNsOog",
};
const authenticatedRejectCanonicalWithoutProof =
	'{"code":"continuity-failure","future":{"proof":"nested-kept"},"kind":"reject","responderNonce":"wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t8"}';

function fromHex(value: string): Uint8Array {
	return Uint8Array.from(Buffer.from(value, "hex"));
}

describe("Default RPC cryptography", () => {
	it("RPC-SEC-002 RPC-CORPUS-001 matches internal RFC JCS, HKDF, and HMAC known answers", () => {
		const jcsKnownAnswers: readonly Readonly<{
			input: RpcJsonRecord;
			canonical: string;
		}>[] = [
			{
				input: {
					numbers: [Number("333333333.33333329"), 1e30, 4.5, 0.002, 1e-27],
					string: '€$\u000f\nA\'B"\\\\"/',
					literals: [null, true, false],
				},
				canonical:
					'{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
			},
			{
				input: {
					"€": "Euro Sign",
					"\r": "Carriage Return",
					דּ: "Hebrew Letter Dalet With Dagesh",
					"1": "One",
					"😀": "Emoji: Grinning Face",
					"\u0080": "Control",
					ö: "Latin Small Letter O With Diaeresis",
				},
				canonical:
					'{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
			},
		];

		for (const knownAnswer of jcsKnownAnswers) {
			expect(cryptography.canonicalize(knownAnswer.input)).toBe(
				knownAnswer.canonical,
			);
		}

		const hkdf = Buffer.from(
			hkdfSync(
				"sha256",
				fromHex("0b".repeat(22)),
				fromHex("000102030405060708090a0b0c"),
				fromHex("f0f1f2f3f4f5f6f7f8f9"),
				42,
			),
		).toString("hex");
		expect(hkdf).toBe(
			"3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
		);

		const hmac = createHmac("sha256", fromHex("0b".repeat(20)))
			.update(fromHex("4869205468657265"))
			.digest("hex");
		expect(hmac).toBe(
			"b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
		);
	});

	it("RPC-SEC-002 RPC-SEC-003 RPC-CORPUS-001 signs the internal profile transcript with every unknown tail", async () => {
		const sessionContextHash = createHash("sha256")
			.update(sessionContextCanonical, "utf8")
			.digest();
		expect(sessionContextHash.toString("hex")).toBe(sessionContextSha256Hex);
		expect(
			Buffer.from(
				hkdfSync(
					"sha256",
					fromHex(sessionSecretHex),
					sessionContextHash,
					fromHex(proofKeyDomainHex),
					32,
				),
			).toString("hex"),
		).toBe(proofKeyHex);
		expect(cryptography.canonicalize(freshRequest)).toBe(freshRequestCanonical);

		const proofKey = await cryptography.deriveProofKey(
			fromHex(sessionSecretHex),
			sessionId,
		);
		expect(proofKey.extractable).toBe(false);
		expect(
			await cryptography.signProof({
				kind: RpcProofOperationKindEnum.freshAccept,
				proofKey,
				request: freshRequest,
				record: freshAccept,
			}),
		).toBe(freshAccept.proof);
		expect(
			await cryptography.signProof({
				kind: RpcProofOperationKindEnum.resumeRequest,
				proofKey,
				record: resumeRequest,
			}),
		).toBe(resumeRequest.proof);
		expect(
			await cryptography.signProof({
				kind: RpcProofOperationKindEnum.resumeAccept,
				proofKey,
				request: resumeRequest,
				record: resumeAccept,
			}),
		).toBe(resumeAccept.proof);
		expect(
			await cryptography.signProof({
				kind: RpcProofOperationKindEnum.resumeReject,
				proofKey,
				request: resumeRequest,
				record: authenticatedReject,
			}),
		).toBe(authenticatedReject.proof);

		for (const [record, canonical] of [
			[freshAccept, freshAcceptCanonicalWithoutProof],
			[resumeRequest, resumeRequestCanonicalWithoutProof],
			[resumeAccept, resumeAcceptCanonicalWithoutProof],
			[authenticatedReject, authenticatedRejectCanonicalWithoutProof],
		] as const) {
			const { proof: _proof, ...withoutProof } = record;
			expect(cryptography.canonicalize(withoutProof)).toBe(canonical);
		}
	});
});
