/**
 * @overview Published husky-di-rpc/1 normative wire corpus verification.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createHash, createHmac, hkdfSync } from "node:crypto";
import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
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
const finalRawIds = `valid-fresh-request
valid-fresh-accept
valid-resume-request
valid-resume-accept
valid-fresh-reject
valid-generic-resume-reject-with-unknown-tail
valid-unary-call-with-unknown-tails
valid-cancel
valid-result-with-void
valid-result-with-null
valid-safe-error-without-details
invalid-error-details-field
valid-ack-zero
valid-ping
valid-pong
valid-close
valid-legal-whitespace-order-and-escape
valid-unary-number-domain
valid-depth-limit
valid-unary-application-args-depth-limit
valid-string-byte-limit
valid-member-name-byte-limit
valid-unary-array-element-limit
valid-transport-message-byte-limit
invalid-malformed-utf8
invalid-leading-bom
invalid-duplicate-key-after-escape
invalid-second-json-value
invalid-non-whitespace-trailing-data
invalid-root-array
invalid-unpaired-surrogate
invalid-negative-zero
invalid-non-finite-number
invalid-unsafe-protocol-integer
invalid-empty-profile-offer
invalid-duplicate-profile-offer
invalid-base64-padding
invalid-base64-non-url-alphabet
invalid-base64-wrong-length
invalid-fresh-binding-epoch
invalid-resume-reject-message
invalid-reserved-then-member
invalid-leading-zero-call-ordinal
invalid-outcome-unknown-wire-error
invalid-error-object-unknown-field
invalid-close-sequence
invalid-active-kind
invalid-depth-limit-plus-one
invalid-unary-application-args-depth-limit-plus-one
invalid-string-byte-limit-plus-one
invalid-member-name-byte-limit-plus-one
invalid-unary-array-element-limit-plus-one
invalid-transport-message-byte-limit-plus-one
valid-stream-method
valid-stream-property
valid-stream-item
valid-stream-credit
valid-stream-cancel
valid-stream-complete
valid-stream-error-canceled
valid-stream-error-unavailable
valid-stream-error-handler-failed
valid-stream-error-unknown-service
valid-stream-error-unknown-member
valid-stream-error-overflow
invalid-stream-method-credit-zero
invalid-stream-method-credit-two
invalid-stream-property-with-args
invalid-stream-start-method-field
invalid-stream-then-member
invalid-stream-id-zero
invalid-stream-id-leading-zero
invalid-stream-id-max-plus-one
invalid-stream-item-ordinal-zero
invalid-stream-credit-through-zero
invalid-stream-terminal-boundary-unsafe
invalid-stream-error-code
invalid-stream-error-details-field
valid-max-stream-method-envelope
valid-max-stream-item-envelope
valid-max-node-limit
invalid-max-node-limit-plus-one`.split("\n");
const transcriptOracleOnlySelectors = [
	"transcript:rpc1:session-counter-exhaustion-protected-tail#ordinary-admission-enters-reserved-window",
	"transcript:rpc1:session-counter-exhaustion-protected-tail#existing-cancel-uses-reserve",
	"transcript:rpc1:session-counter-exhaustion-protected-tail#finite-drain-sends-unsequenced-close",
	"transcript:rpc1:protected-tail#ordinary-work-stops-at-protected-window",
	"transcript:rpc1:protected-tail#terminal-and-cancel-converge-without-wrap",
	"transcript:rpc1:max-envelope#maximum-method-and-item-envelopes-pass",
] as const;
const finalTranscriptScenarioIds = `unary-fresh-establishment
unary-lost-fresh-accept
unary-normal-resume-and-replay-barrier
unary-lost-resume-accept-higher-attempt
unary-lost-ack-and-ack-bounds
unary-sequence-gap
unary-regressed-sequence-conflicting-body
session-authenticated-cursor-boundaries
session-generic-resume-rejects
session-authenticated-continuity-reject
session-stale-connection-epoch-gate
session-activity-ping-pong
session-graceful-close
session-counter-exhaustion-protected-tail
method-property-mismatch
w1-burst-overcredit
next-unsubscribe
lost-item-vs-ack
replay-equivocation-gc
recovery-bidirectional-barrier
cancel-complete-race
terminal-late-credit
retired-controls
opposite-direction-same-id
protected-tail
max-envelope
shutdown-g-f-close`.split("\n");

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
	readonly expectedByteLength?: number;
	readonly expectedNodeCount?: number;
	readonly covers: readonly string[];
};

type KatProvenance = {
	readonly source: string;
	readonly generatorArtifact: {
		readonly path: string;
		readonly sha256: string;
	};
	readonly inputSha256: string;
	readonly outputSha256: string;
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

function countJsonNodes(value: unknown): number {
	if (Array.isArray(value)) {
		return 1 + value.reduce((count, item) => count + countJsonNodes(item), 0);
	}
	if (typeof value === "object" && value !== null) {
		return (
			1 +
			Object.values(value).reduce(
				(count, item) => count + countJsonNodes(item),
				0,
			)
		);
	}
	return 1;
}

function canonicalizeIndependent(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalizeIndependent).join(",")}]`;
	}
	if (typeof value === "object" && value !== null) {
		const record = value as Readonly<Record<string, unknown>>;
		return `{${Object.keys(record)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${canonicalizeIndependent(record[key])}`,
			)
			.join(",")}}`;
	}
	const serialized = JSON.stringify(value);
	if (serialized === undefined) {
		throw new TypeError("Independent JCS input is outside the JSON domain.");
	}
	return serialized;
}

function signProfileProofIndependent(
	proofKey: Uint8Array,
	label: string,
	...canonicalRecords: readonly string[]
): string {
	const domain = Buffer.from(`husky-di-rpc/1\0${label}\0`, "utf8");
	const hashes = canonicalRecords.map((canonical) =>
		createHash("sha256").update(canonical, "utf8").digest(),
	);
	return createHmac("sha256", proofKey)
		.update(Buffer.concat([domain, ...hashes]))
		.digest("base64url");
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
				"streamMethodStart",
				"streamPropertyStart",
				"streamItem",
				"streamCredit",
				"streamCancel",
				"streamComplete",
				"streamError",
			]),
		);
	});

	it("RPC-CORPUS-005 RPC-CORPUS-010 binds the four assets and compiles from the pinned offline metaschema closure", async () => {
		const manifest = JSON.parse(
			await readFile(
				new URL("./corpus-manifest.json", import.meta.url),
				"utf8",
			),
		) as {
			readonly publicAssets: readonly {
				readonly name: string;
				readonly bytes: number;
				readonly sha256: string;
			}[];
			readonly validator: {
				readonly name: string;
				readonly version: string;
				readonly mode: string;
			};
			readonly metaschemaClosure: readonly {
				readonly uri: string;
				readonly sha256: string;
				readonly bytesBase64: string;
			}[];
		};
		expect(manifest.publicAssets.map(({ name }) => name)).toEqual([
			"schema.json",
			"raw-vectors.json",
			"transcripts.json",
			"known-answer-vectors.json",
		]);
		for (const asset of manifest.publicAssets) {
			const bytes = await readFile(new URL(asset.name, corpusRoot));
			expect(bytes.byteLength, asset.name).toBe(asset.bytes);
			expect(createHash("sha256").update(bytes).digest("hex"), asset.name).toBe(
				asset.sha256,
			);
		}
		expect(manifest.validator).toEqual({
			name: "ajv",
			version: "8.18.0",
			mode: "offline-draft-2020-12",
		});
		expect(new Set(manifest.metaschemaClosure.map(({ uri }) => uri)).size).toBe(
			8,
		);
		for (const resource of manifest.metaschemaClosure) {
			const bytes = Buffer.from(resource.bytesBase64, "base64");
			expect(
				createHash("sha256").update(bytes).digest("hex"),
				resource.uri,
			).toBe(resource.sha256);
			expect(JSON.parse(bytes.toString("utf8"))).toHaveProperty(
				"$id",
				resource.uri,
			);
		}

		const schema = await readJsonAsset("schema.json");
		const validator = new Ajv2020({
			strict: false,
			validateSchema: true,
			meta: false,
		});
		for (const resource of manifest.metaschemaClosure.slice(1)) {
			validator.addMetaSchema(
				JSON.parse(
					Buffer.from(resource.bytesBase64, "base64").toString("utf8"),
				),
				undefined,
				false,
			);
		}
		const rootMetaschema = manifest.metaschemaClosure[0];
		if (rootMetaschema === undefined) {
			throw new Error("Expected the pinned Draft 2020-12 root metaschema.");
		}
		validator.addMetaSchema(
			JSON.parse(
				Buffer.from(rootMetaschema.bytesBase64, "base64").toString("utf8"),
			),
			undefined,
			false,
		);
		expect(() =>
			validator.compile(schema as Parameters<typeof validator.compile>[0]),
		).not.toThrow();
		expect(() =>
			validator.compile({
				$schema: "https://json-schema.org/draft/2020-12/schema",
				$ref: "https://unknown.invalid/schema",
			}),
		).toThrow();
	});

	it("RPC-WIRE-017 RPC-WIRE-018 RPC-WIRE-020 RPC-WIRE-025 decodes only the final semantic grammar", () => {
		const encode = (value: object): Uint8Array =>
			new TextEncoder().encode(JSON.stringify(value));
		const semanticMessages = [
			{
				kind: "call",
				callId: "1",
				service: "service",
				member: "unary",
				args: [],
			},
			{
				kind: "stream-method",
				streamId: "1",
				service: "service",
				member: "items",
				args: [],
				creditThrough: 1,
			},
			{
				kind: "stream-property",
				streamId: "1",
				service: "service",
				member: "items$",
				creditThrough: 1,
			},
			{ kind: "stream-item", streamId: "1", itemOrdinal: 1, value: null },
			{ kind: "stream-credit", streamId: "1", creditThrough: 2 },
			{ kind: "stream-cancel", streamId: "1" },
			{ kind: "stream-complete", streamId: "1", itemThrough: 1 },
			{
				kind: "stream-error",
				streamId: "1",
				itemThrough: 1,
				error: { code: "overflow", message: "Remote stream overflowed." },
			},
		] as const;

		for (const [index, message] of semanticMessages.entries()) {
			expect(
				codec.decode(
					encode({ kind: "message", seq: index + 1, message }),
					RpcDecodePhaseEnum.active,
				).kind,
			).toBe("message");
		}

		expect(() =>
			codec.decode(
				encode({
					kind: "message",
					seq: 1,
					message: {
						kind: "stream-property",
						streamId: "1",
						service: "service",
						member: "items$",
						args: [],
						creditThrough: 1,
					},
				}),
				RpcDecodePhaseEnum.active,
			),
		).toThrow();
		expect(() =>
			codec.decode(
				encode({
					kind: "message",
					seq: 1,
					message: {
						kind: "error",
						callId: "1",
						error: {
							code: "handler-failed",
							message: "Remote call failed.",
							details: null,
						},
					},
				}),
				RpcDecodePhaseEnum.active,
			),
		).toThrow();
	});

	it("RPC-CORPUS-006 RPC-CORPUS-009 RPC-WIRE-002 RPC-WIRE-003 RPC-WIRE-004 RPC-WIRE-005 RPC-WIRE-006 RPC-WIRE-007 RPC-WIRE-008 RPC-WIRE-009 RPC-WIRE-010 RPC-WIRE-011 RPC-WIRE-012 RPC-WIRE-013 RPC-WIRE-014 RPC-WIRE-015 RPC-VALID-001 RPC-VALID-004 RPC-VALID-005 RPC-VALID-007 publishes executable raw byte vectors", async () => {
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
		expect(corpus.vectors.map(({ id }) => id)).toEqual(finalRawIds);
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
		expect(coverage).toEqual(
			expect.arrayContaining([
				"RPC-CORPUS-006",
				"RPC-VALID-009",
				"RPC-WIRE-017",
				"RPC-WIRE-018",
				"RPC-WIRE-020",
				"RPC-WIRE-023",
			]),
		);

		const acceptedInvalidVectors: string[] = [];
		for (const vector of corpus.vectors) {
			if (vector.expectedByteLength !== undefined) {
				expect(renderRawVector(vector).byteLength, vector.id).toBe(
					vector.expectedByteLength,
				);
			}
			if (vector.expectedNodeCount !== undefined) {
				expect(
					countJsonNodes(
						JSON.parse(new TextDecoder().decode(renderRawVector(vector))),
					),
					vector.id,
				).toBe(vector.expectedNodeCount);
			}
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

	it("RPC-CORPUS-008 RPC-SEC-002 RPC-SEC-003 publishes independent JCS, HKDF, HMAC, and profile known answers", async () => {
		const vectors = (await readJsonAsset("known-answer-vectors.json")) as {
			readonly jcs: readonly {
				readonly id: string;
				readonly covers: readonly string[];
				readonly input: RpcJsonRecord;
				readonly canonical: string;
				readonly provenance: KatProvenance;
			}[];
			readonly hkdfSha256: {
				readonly id: string;
				readonly covers: readonly string[];
				readonly ikmHex: string;
				readonly saltHex: string;
				readonly infoHex: string;
				readonly length: number;
				readonly okmHex: string;
				readonly provenance: KatProvenance;
			};
			readonly hmacSha256: {
				readonly id: string;
				readonly covers: readonly string[];
				readonly keyHex: string;
				readonly dataHex: string;
				readonly tagHex: string;
				readonly provenance: KatProvenance;
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
				readonly provenance: KatProvenance;
			};
			readonly provenance: {
				readonly jcs: string;
				readonly hkdfSha256: string;
				readonly hmacSha256: string;
				readonly profileTranscript: string;
			};
			readonly securityActions: readonly {
				readonly id: string;
				readonly action: string;
				readonly expected: string;
				readonly provenance: {
					readonly model: string;
					readonly authority: string;
					readonly generatorArtifact: KatProvenance["generatorArtifact"];
					readonly actionSha256: string;
					readonly expectedSha256: string;
				};
			}[];
		};
		const sharedCoverage = ["RPC-CORPUS-001", "RPC-SEC-002"];
		const generatorBytes = await readFile(
			new URL("../../scripts/generate-rpc-wire-corpus.mjs", import.meta.url),
		);
		const generatorSha256 = createHash("sha256")
			.update(generatorBytes)
			.digest("hex");
		const expectProvenance = (
			provenance: KatProvenance,
			input: unknown,
			output: unknown,
		): void => {
			expect(provenance.source.length).toBeGreaterThan(0);
			expect(provenance.generatorArtifact).toEqual({
				path: "scripts/generate-rpc-wire-corpus.mjs",
				sha256: generatorSha256,
			});
			expect(provenance.inputSha256).toBe(
				createHash("sha256").update(JSON.stringify(input)).digest("hex"),
			);
			expect(provenance.outputSha256).toBe(
				createHash("sha256").update(JSON.stringify(output)).digest("hex"),
			);
		};

		expect(vectors.jcs.map(({ id }) => id)).toEqual([
			"rfc8785-section-3.2.2",
			"rfc8785-section-3.2.3-utf16-property-order",
		]);
		for (const vector of vectors.jcs) {
			expect(vector.covers).toEqual(sharedCoverage);
			expectProvenance(vector.provenance, vector.input, vector.canonical);
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
		expectProvenance(
			vectors.hkdfSha256.provenance,
			{
				ikmHex: vectors.hkdfSha256.ikmHex,
				saltHex: vectors.hkdfSha256.saltHex,
				infoHex: vectors.hkdfSha256.infoHex,
				length: vectors.hkdfSha256.length,
			},
			vectors.hkdfSha256.okmHex,
		);
		expectProvenance(
			vectors.hmacSha256.provenance,
			{
				keyHex: vectors.hmacSha256.keyHex,
				dataHex: vectors.hmacSha256.dataHex,
			},
			vectors.hmacSha256.tagHex,
		);
		expect(
			Object.values(vectors.provenance).every((value) => value.length > 0),
		).toBe(true);
		expect(vectors.securityActions.map(({ id }) => id)).toEqual([
			"stream-cursor-lost-ack",
			"old-binding-fence",
			"wrong-proof-retains-stream",
			"recovery-terminal-no-resubscribe",
			"post-g-validation-order",
			"protected-transport-no-record-mac",
			"payload-error-redaction",
		]);
		for (const action of vectors.securityActions) {
			expect(action.action.length).toBeGreaterThan(0);
			expect(action.expected.length).toBeGreaterThan(0);
			expect(action.provenance).toMatchObject({
				model: "independent action-prefix oracle",
				authority: "RPC-CORPUS-008",
				generatorArtifact: {
					path: "scripts/generate-rpc-wire-corpus.mjs",
					sha256: generatorSha256,
				},
			});
			expect(action.provenance.actionSha256).toBe(
				createHash("sha256").update(action.action).digest("hex"),
			);
			expect(action.provenance.expectedSha256).toBe(
				createHash("sha256").update(action.expected).digest("hex"),
			);
		}

		for (const vector of vectors.jcs) {
			expect(canonicalizeIndependent(vector.input)).toBe(vector.canonical);
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
		expectProvenance(
			transcript.provenance,
			{
				sessionSecretHex: transcript.sessionSecretHex,
				freshRequest: transcript.freshRequest,
				freshAccept: transcript.freshAccept,
				resumeRequest: transcript.resumeRequest,
				resumeAccept: transcript.resumeAccept,
				authenticatedReject: transcript.authenticatedReject,
			},
			{
				proofKeyHex: transcript.proofKeyHex,
				freshAcceptProof: transcript.freshAcceptProof,
				resumeRequestProof: transcript.resumeRequestProof,
				resumeAcceptProof: transcript.resumeAcceptProof,
				authenticatedRejectProof: transcript.authenticatedRejectProof,
			},
		);
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
		const independentProofKey = fromHex(transcript.proofKeyHex);
		expect(
			signProfileProofIndependent(
				independentProofKey,
				"fresh-accept",
				transcript.freshRequestCanonical,
				transcript.freshAcceptCanonicalWithoutProof,
			),
		).toBe(transcript.freshAcceptProof);
		expect(
			signProfileProofIndependent(
				independentProofKey,
				"resume-request",
				transcript.resumeRequestCanonicalWithoutProof,
			),
		).toBe(transcript.resumeRequestProof);
		expect(
			signProfileProofIndependent(
				independentProofKey,
				"resume-accept",
				transcript.resumeRequestCanonicalWithoutProof,
				transcript.resumeAcceptCanonicalWithoutProof,
			),
		).toBe(transcript.resumeAcceptProof);
		expect(
			signProfileProofIndependent(
				independentProofKey,
				"resume-reject",
				transcript.resumeRequestCanonicalWithoutProof,
				transcript.authenticatedRejectCanonicalWithoutProof,
			),
		).toBe(transcript.authenticatedRejectProof);
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

	it("RPC-CORPUS-007 RPC-CORPUS-011 publishes 68 complete action-prefix models and the exact 62/6 public split", async () => {
		const corpus = (await readJsonAsset("transcripts.json")) as {
			readonly profile: string;
			readonly scenarios: readonly {
				readonly id: string;
				readonly covers: readonly string[];
				readonly steps: readonly {
					readonly id: string;
					readonly action: object;
					readonly independentExpected: {
						readonly state: object;
						readonly effects: object;
						readonly resources: object;
						readonly counters: object;
						readonly credit: object;
						readonly evidence: object;
						readonly nextPermittedRecords: object | readonly string[];
					};
					readonly publicProjection: object;
				}[];
			}[];
		};

		expect(corpus.profile).toBe("husky-di-rpc/1");
		expect(corpus.scenarios.map(({ id }) => id)).toEqual(
			finalTranscriptScenarioIds,
		);
		expect(new Set(corpus.scenarios.map(({ id }) => id)).size).toBe(
			corpus.scenarios.length,
		);
		const selectors = corpus.scenarios.flatMap((scenario) =>
			scenario.steps.map((step) => `transcript:rpc1:${scenario.id}#${step.id}`),
		);
		expect(selectors).toHaveLength(68);
		expect(new Set(selectors).size).toBe(68);
		const transcriptCoverage = [
			...new Set(corpus.scenarios.flatMap(({ covers }) => covers)),
		];
		expect(transcriptCoverage).toEqual(
			expect.arrayContaining([
				"RPC-CORPUS-007",
				"RPC-CORPUS-009",
				"RPC-CORPUS-011",
				"RPC-VALID-009",
				"RPC-WIRE-019",
				"RPC-WIRE-021",
				"RPC-WIRE-022",
				"RPC-WIRE-023",
				"RPC-WIRE-024",
			]),
		);
		expect(
			selectors.filter(
				(selector) =>
					!transcriptOracleOnlySelectors.includes(
						selector as (typeof transcriptOracleOnlySelectors)[number],
					),
			),
		).toHaveLength(62);
		expect(
			selectors.filter((selector) =>
				transcriptOracleOnlySelectors.includes(
					selector as (typeof transcriptOracleOnlySelectors)[number],
				),
			),
		).toEqual(transcriptOracleOnlySelectors);
		for (const scenario of corpus.scenarios) {
			expect(new Set(scenario.steps.map(({ id }) => id)).size).toBe(
				scenario.steps.length,
			);
			for (const step of scenario.steps) {
				expect(
					Object.keys(step.independentExpected).sort(),
					`${scenario.id}/${step.id}`,
				).toEqual([
					"counters",
					"credit",
					"effects",
					"evidence",
					"nextPermittedRecords",
					"resources",
					"state",
				]);
				expect(step.publicProjection).not.toHaveProperty("currentBinding");
				expect(step.publicProjection).not.toHaveProperty("resources");
				expect(step.publicProjection).not.toHaveProperty("counters");
			}
		}
	});
});
