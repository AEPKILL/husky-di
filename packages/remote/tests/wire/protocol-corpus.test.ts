/**
 * @overview Published husky-di-rpc/1 normative wire corpus verification.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createHash, createHmac, hkdfSync } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { RpcDecodePhaseEnum } from "../../src/enums/protocol/rpc-decode-phase.enum";
import { RpcProofOperationKindEnum } from "../../src/enums/protocol/rpc-proof-operation-kind.enum";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import { RpcCryptographyImpl } from "../../src/impls/protocol/rpc-cryptography.impl";
import type {
	RpcFreshRequest,
	RpcJsonRecord,
	RpcResumeRequest,
} from "../../src/types/protocol/rpc-wire-record.type";

const corpusRoot = new URL("../../wire/husky-di-rpc-1/", import.meta.url);
const codec = new RpcCodecImpl();
const cryptography = new RpcCryptographyImpl();

async function readJsonAsset(path: string): Promise<unknown> {
	return JSON.parse(await readFile(new URL(path, corpusRoot), "utf8"));
}

type RawVector = {
	readonly id: string;
	readonly validity: "valid" | "invalid";
	readonly validator:
		| "decode"
		| "fresh-request"
		| "fresh-accept"
		| "resume-request"
		| "resume-outcome"
		| "active";
	readonly source: {
		readonly segments: readonly (
			| { readonly utf8: string }
			| { readonly hex: string }
			| { readonly repeatUtf8: string; readonly count: number }
		)[];
	};
	readonly expectedKind?: string;
	readonly covers: readonly string[];
};

function renderRawVector(vector: RawVector): Uint8Array {
	return Buffer.concat(
		vector.source.segments.map((segment) => {
			if ("utf8" in segment) {
				return Buffer.from(segment.utf8, "utf8");
			}
			if ("hex" in segment) {
				return Buffer.from(segment.hex, "hex");
			}
			return Buffer.from(segment.repeatUtf8.repeat(segment.count), "utf8");
		}),
	);
}

function validateRawVector(vector: RawVector): string {
	const bytes = renderRawVector(vector);
	switch (vector.validator) {
		case "fresh-request":
			return codec.decode(bytes, RpcDecodePhaseEnum.bootstrapRequest).kind;
		case "fresh-accept":
			return codec.decode(bytes, RpcDecodePhaseEnum.freshAccept).kind;
		case "resume-request":
			return codec.decode(bytes, RpcDecodePhaseEnum.bootstrapRequest).kind;
		case "resume-outcome":
			return codec.decode(bytes, RpcDecodePhaseEnum.resumeOutcome).kind;
		case "active":
			return codec.decode(bytes, RpcDecodePhaseEnum.active).kind;
		default:
			return codec.decode(bytes, RpcDecodePhaseEnum.json).kind as string;
	}
}

function fromHex(value: string): Uint8Array {
	return Uint8Array.from(Buffer.from(value, "hex"));
}

describe("published husky-di-rpc/1 wire corpus", () => {
	it("RPC-CORPUS-001 RPC-WIRE-001 publishes the complete JSON Schema 2020-12 grammar", async () => {
		const schema = await readJsonAsset("schema.json");

		expect(schema).toMatchObject({
			$schema: "https://json-schema.org/draft/2020-12/schema",
			$id: "https://husky-di.dev/wire/husky-di-rpc-1/schema.json",
			title: "husky-di-rpc/1 Transport message",
		});
		expect(Object.keys((schema as { $defs: object }).$defs)).toEqual(
			expect.arrayContaining([
				"freshRequest",
				"freshAccept",
				"resumeRequest",
				"resumeAccept",
				"freshReject",
				"resumeReject",
				"messageEnvelope",
				"ack",
				"ping",
				"pong",
				"close",
				"call",
				"cancel",
				"result",
				"error",
			]),
		);
	});

	it("RPC-CORPUS-001 RPC-WIRE-002 RPC-WIRE-003 RPC-WIRE-004 RPC-WIRE-005 RPC-WIRE-006 RPC-WIRE-007 RPC-WIRE-008 RPC-WIRE-009 RPC-WIRE-010 RPC-WIRE-011 RPC-WIRE-012 RPC-WIRE-013 RPC-WIRE-014 RPC-WIRE-015 RPC-VALID-001 RPC-VALID-004 RPC-VALID-005 RPC-VALID-007 publishes executable raw byte vectors", async () => {
		const corpus = (await readJsonAsset("raw-vectors.json")) as {
			readonly profile: string;
			readonly vectors: readonly RawVector[];
		};
		const requiredCoverage = [
			"utf8",
			"bom",
			"duplicate-key",
			"trailing-data",
			"number",
			"limit",
			"base64",
			"allocation-boundary",
		];

		expect(corpus.profile).toBe("husky-di-rpc/1");
		expect(new Set(corpus.vectors.map(({ id }) => id)).size).toBe(
			corpus.vectors.length,
		);
		const coverage = [
			...new Set(corpus.vectors.flatMap(({ covers }) => covers)),
		];
		expect(coverage).toEqual(expect.arrayContaining([...requiredCoverage]));
		expect(coverage).toEqual(
			expect.arrayContaining(
				Array.from(
					{ length: 15 },
					(_, index) => `RPC-WIRE-${String(index + 1).padStart(3, "0")}`,
				),
			),
		);

		const acceptedInvalidVectors: string[] = [];
		for (const vector of corpus.vectors) {
			if (vector.validity === "valid") {
				expect(validateRawVector(vector), vector.id).toBe(vector.expectedKind);
			} else {
				try {
					validateRawVector(vector);
					acceptedInvalidVectors.push(vector.id);
				} catch {
					// Expected rejection is the observable contract for an invalid vector.
				}
			}
		}
		expect(acceptedInvalidVectors).toEqual([]);
	});

	it("RPC-CORPUS-001 RPC-SEC-002 RPC-SEC-003 publishes independent JCS, HKDF, HMAC, and profile known answers", async () => {
		const vectors = (await readJsonAsset("known-answer-vectors.json")) as {
			readonly jcs: readonly {
				readonly id: string;
				readonly covers: readonly string[];
				readonly input: RpcJsonRecord;
				readonly canonical: string;
			}[];
			readonly hkdfSha256: {
				readonly id: string;
				readonly covers: readonly string[];
				readonly ikmHex: string;
				readonly saltHex: string;
				readonly infoHex: string;
				readonly length: number;
				readonly okmHex: string;
			};
			readonly hmacSha256: {
				readonly id: string;
				readonly covers: readonly string[];
				readonly keyHex: string;
				readonly dataHex: string;
				readonly tagHex: string;
			};
			readonly profileTranscript: {
				readonly id: string;
				readonly covers: readonly string[];
				readonly sessionSecretHex: string;
				readonly sessionContextCanonical: string;
				readonly sessionContextSha256Hex: string;
				readonly proofKeyDomainHex: string;
				readonly proofKeyHex: string;
				readonly freshRequest: RpcFreshRequest;
				readonly freshRequestCanonical: string;
				readonly freshAccept: RpcJsonRecord;
				readonly freshAcceptCanonicalWithoutProof: string;
				readonly freshAcceptProof: string;
				readonly resumeRequest: RpcJsonRecord;
				readonly resumeRequestCanonicalWithoutProof: string;
				readonly resumeRequestProof: string;
				readonly resumeAccept: RpcJsonRecord;
				readonly resumeAcceptCanonicalWithoutProof: string;
				readonly resumeAcceptProof: string;
				readonly authenticatedReject: RpcJsonRecord;
				readonly authenticatedRejectCanonicalWithoutProof: string;
				readonly authenticatedRejectProof: string;
			};
		};
		const sharedCoverage = ["RPC-CORPUS-001", "RPC-SEC-002"];

		expect(vectors.jcs.map(({ id }) => id)).toEqual([
			"rfc8785-section-3.2.2",
			"rfc8785-section-3.2.3-utf16-property-order",
		]);
		for (const vector of vectors.jcs) {
			expect(vector.covers).toEqual(sharedCoverage);
		}
		expect(vectors.hkdfSha256).toMatchObject({
			id: "rfc5869-appendix-a.1",
			covers: sharedCoverage,
		});
		expect(vectors.hmacSha256).toMatchObject({
			id: "rfc4231-section-4.2-test-case-1",
			covers: sharedCoverage,
		});
		expect(vectors.profileTranscript).toMatchObject({
			id: "husky-di-rpc-1-proof-transcript",
			covers: [...sharedCoverage, "RPC-SEC-003"],
		});

		for (const vector of vectors.jcs) {
			expect(cryptography.canonicalize(vector.input)).toBe(vector.canonical);
		}

		const hkdf = vectors.hkdfSha256;
		expect(
			Buffer.from(
				hkdfSync(
					"sha256",
					fromHex(hkdf.ikmHex),
					fromHex(hkdf.saltHex),
					fromHex(hkdf.infoHex),
					hkdf.length,
				),
			).toString("hex"),
		).toBe(hkdf.okmHex);

		const hmac = vectors.hmacSha256;
		expect(
			createHmac("sha256", fromHex(hmac.keyHex))
				.update(fromHex(hmac.dataHex))
				.digest("hex"),
		).toBe(hmac.tagHex);

		const transcript = vectors.profileTranscript;
		const sessionContextHash = createHash("sha256")
			.update(transcript.sessionContextCanonical, "utf8")
			.digest();
		expect(sessionContextHash.toString("hex")).toBe(
			transcript.sessionContextSha256Hex,
		);
		expect(
			Buffer.from(
				hkdfSync(
					"sha256",
					fromHex(transcript.sessionSecretHex),
					sessionContextHash,
					fromHex(transcript.proofKeyDomainHex),
					32,
				),
			).toString("hex"),
		).toBe(transcript.proofKeyHex);
		expect(cryptography.canonicalize(transcript.freshRequest)).toBe(
			transcript.freshRequestCanonical,
		);
		const proofKey = await cryptography.deriveProofKey(
			fromHex(transcript.sessionSecretHex),
			transcript.freshAccept.sessionId as string,
		);
		expect(proofKey.extractable).toBe(false);
		expect(
			await cryptography.signProof({
				kind: RpcProofOperationKindEnum.freshAccept,
				proofKey,
				request: transcript.freshRequest,
				record: transcript.freshAccept,
			}),
		).toBe(transcript.freshAcceptProof);
		expect(
			await cryptography.signProof({
				kind: RpcProofOperationKindEnum.resumeRequest,
				proofKey,
				record: transcript.resumeRequest,
			}),
		).toBe(transcript.resumeRequestProof);
		expect(
			await cryptography.signProof({
				kind: RpcProofOperationKindEnum.resumeAccept,
				proofKey,
				request: transcript.resumeRequest as RpcResumeRequest,
				record: transcript.resumeAccept,
			}),
		).toBe(transcript.resumeAcceptProof);
		expect(
			await cryptography.signProof({
				kind: RpcProofOperationKindEnum.resumeReject,
				proofKey,
				request: transcript.resumeRequest as RpcResumeRequest,
				record: transcript.authenticatedReject,
			}),
		).toBe(transcript.authenticatedRejectProof);

		for (const [record, canonical] of [
			[transcript.freshAccept, transcript.freshAcceptCanonicalWithoutProof],
			[transcript.resumeRequest, transcript.resumeRequestCanonicalWithoutProof],
			[transcript.resumeAccept, transcript.resumeAcceptCanonicalWithoutProof],
			[
				transcript.authenticatedReject,
				transcript.authenticatedRejectCanonicalWithoutProof,
			],
		] as const) {
			const { proof: _proof, ...withoutProof } = record;
			expect(cryptography.canonicalize(withoutProof)).toBe(canonical);
		}
	});

	it("RPC-CORPUS-002 publishes complete state assertions for every required recovery transcript", async () => {
		const corpus = (await readJsonAsset("transcripts.json")) as {
			readonly profile: string;
			readonly scenarios: readonly {
				readonly id: string;
				readonly covers: readonly string[];
				readonly steps: readonly {
					readonly id: string;
					readonly action: object;
					readonly assert: {
						readonly initiatorState: string;
						readonly responderState: string;
						readonly currentBinding: {
							readonly initiator: string | null;
							readonly responder: string | null;
						};
						readonly dispatchCount: number;
						readonly callerOutcome: object;
						readonly retainedEvidence: {
							readonly initiator: readonly string[];
							readonly responder: readonly string[];
						};
						readonly nextPermittedRecords: {
							readonly initiator: readonly string[];
							readonly responder: readonly string[];
						};
					};
				}[];
			}[];
		};
		const requiredCoverage = [
			"fresh",
			"lost-fresh-accept",
			"normal-resume",
			"lost-resume-accept-higher-attempt",
			"replay-barrier",
			"lost-ack",
			"duplicate-seq",
			"gap-seq",
			"regressed-seq",
			"stale-ack",
			"equal-ack",
			"future-ack",
			"cursor-lower-bound",
			"cursor-upper-bound",
			"wrong-epoch",
			"stale-connection",
			"wrong-proof",
			"wrong-profile",
			"wrong-session",
			"generic-reject",
			"authenticated-reject",
			"ping",
			"pong",
			"close",
			"counter-exhaustion",
		] as const;

		expect(corpus.profile).toBe("husky-di-rpc/1");
		expect(new Set(corpus.scenarios.map(({ id }) => id)).size).toBe(
			corpus.scenarios.length,
		);
		expect(corpus.scenarios.flatMap(({ covers }) => covers)).toEqual(
			expect.arrayContaining([...requiredCoverage]),
		);

		for (const scenario of corpus.scenarios) {
			expect(scenario.steps.length, scenario.id).toBeGreaterThanOrEqual(2);
			expect(new Set(scenario.steps.map(({ id }) => id)).size).toBe(
				scenario.steps.length,
			);
			for (const step of scenario.steps) {
				expect(
					Object.keys(step.assert).sort(),
					`${scenario.id}/${step.id}`,
				).toEqual([
					"callerOutcome",
					"currentBinding",
					"dispatchCount",
					"initiatorState",
					"nextPermittedRecords",
					"responderState",
					"retainedEvidence",
				]);
				expect(step.assert.dispatchCount).toBeGreaterThanOrEqual(0);
				expect(step.assert.currentBinding).toHaveProperty("initiator");
				expect(step.assert.currentBinding).toHaveProperty("responder");
				expect(step.assert.retainedEvidence).toMatchObject({
					initiator: expect.any(Array),
					responder: expect.any(Array),
				});
				expect(step.assert.nextPermittedRecords).toMatchObject({
					initiator: expect.any(Array),
					responder: expect.any(Array),
				});
			}
		}
	});
});
