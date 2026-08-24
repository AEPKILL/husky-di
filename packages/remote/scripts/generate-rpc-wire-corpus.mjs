/**
 * @overview Deterministically assembles the final husky-di-rpc/1 corpus assets.
 * @author AEPKILL
 * @created 2026-08-25 00:00:00
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const assetUrl = new URL("../wire/husky-di-rpc-1/raw-vectors.json", import.meta.url);
const corpus = JSON.parse(await readFile(assetUrl, "utf8"));
const renamedIds = new Map([
	["valid-number-domain", "valid-unary-number-domain"],
	["valid-application-args-depth-limit", "valid-unary-application-args-depth-limit"],
	["valid-array-element-limit", "valid-unary-array-element-limit"],
	["invalid-reserved-then-method", "invalid-reserved-then-member"],
	["invalid-application-args-depth-limit-plus-one", "invalid-unary-application-args-depth-limit-plus-one"],
	["invalid-array-element-limit-plus-one", "invalid-unary-array-element-limit-plus-one"],
]);
const firstStreamIndex = corpus.vectors.findIndex(
	(vector) => vector.id === "valid-stream-method",
);
const baseSource =
	firstStreamIndex === -1
		? corpus.vectors
		: corpus.vectors.slice(0, firstStreamIndex);
const baseVectors = baseSource
	.filter((vector) => vector.id !== "invalid-error-details-field")
	.map((vector) => ({
		...vector,
		id: renamedIds.get(vector.id) ?? vector.id,
	}));

const active = (id, message, validity = "valid") => ({
	id,
	validity,
	validator: "active",
	source: {
		segments: [
			{
				utf8: JSON.stringify({ kind: "message", seq: 1, message }),
			},
		],
	},
	...(validity === "valid" ? { expectedKind: "message" } : {}),
	covers: ["RPC-CORPUS-006", "RPC-WIRE-017", "RPC-WIRE-018", "RPC-WIRE-020"],
});
const streamError = (id, code) =>
	active(id, {
		kind: "stream-error",
		streamId: "1",
		itemThrough: 0,
		error: { code, message: `safe-${code}` },
	});

const invalidDetails = active(
	"invalid-error-details-field",
	{
		kind: "error",
		callId: "1",
		error: {
			code: "handler-failed",
			message: "safe-handler-failed",
			details: null,
		},
	},
	"invalid",
);
const streamVectors = [
	active("valid-stream-method", {
		kind: "stream-method",
		streamId: "1",
		service: "service",
		member: "events",
		args: [],
		creditThrough: 1,
	}),
	active("valid-stream-property", {
		kind: "stream-property",
		streamId: "1",
		service: "service",
		member: "events",
		creditThrough: 1,
	}),
	active("valid-stream-item", {
		kind: "stream-item",
		streamId: "1",
		itemOrdinal: 1,
		value: null,
	}),
	active("valid-stream-credit", {
		kind: "stream-credit",
		streamId: "1",
		creditThrough: 2,
	}),
	active("valid-stream-cancel", { kind: "stream-cancel", streamId: "1" }),
	active("valid-stream-complete", {
		kind: "stream-complete",
		streamId: "1",
		itemThrough: 0,
	}),
	streamError("valid-stream-error-canceled", "canceled"),
	streamError("valid-stream-error-unavailable", "unavailable"),
	streamError("valid-stream-error-handler-failed", "handler-failed"),
	streamError("valid-stream-error-unknown-service", "unknown-service"),
	streamError("valid-stream-error-unknown-member", "unknown-member"),
	streamError("valid-stream-error-overflow", "overflow"),
	active(
		"invalid-stream-method-credit-zero",
		{
			kind: "stream-method",
			streamId: "1",
			service: "service",
			member: "events",
			args: [],
			creditThrough: 0,
		},
		"invalid",
	),
	active(
		"invalid-stream-method-credit-two",
		{
			kind: "stream-method",
			streamId: "1",
			service: "service",
			member: "events",
			args: [],
			creditThrough: 2,
		},
		"invalid",
	),
	active(
		"invalid-stream-property-with-args",
		{
			kind: "stream-property",
			streamId: "1",
			service: "service",
			member: "events",
			args: [],
			creditThrough: 1,
		},
		"invalid",
	),
	active(
		"invalid-stream-start-method-field",
		{
			kind: "stream-method",
			streamId: "1",
			service: "service",
			method: "events",
			args: [],
			creditThrough: 1,
		},
		"invalid",
	),
	active(
		"invalid-stream-then-member",
		{
			kind: "stream-property",
			streamId: "1",
			service: "service",
			member: "then",
			creditThrough: 1,
		},
		"invalid",
	),
	active(
		"invalid-stream-id-zero",
		{ kind: "stream-cancel", streamId: "0" },
		"invalid",
	),
	active(
		"invalid-stream-id-leading-zero",
		{ kind: "stream-cancel", streamId: "01" },
		"invalid",
	),
	active(
		"invalid-stream-id-max-plus-one",
		{ kind: "stream-cancel", streamId: "9007199254740992" },
		"invalid",
	),
	active(
		"invalid-stream-item-ordinal-zero",
		{ kind: "stream-item", streamId: "1", itemOrdinal: 0, value: null },
		"invalid",
	),
	active(
		"invalid-stream-credit-through-zero",
		{ kind: "stream-credit", streamId: "1", creditThrough: 0 },
		"invalid",
	),
	active(
		"invalid-stream-terminal-boundary-unsafe",
		{
			kind: "stream-complete",
			streamId: "1",
			itemThrough: 9007199254740992,
		},
		"invalid",
	),
	active(
		"invalid-stream-error-code",
		{
			kind: "stream-error",
			streamId: "1",
			itemThrough: 0,
			error: { code: "outcome-unknown", message: "unsafe" },
		},
		"invalid",
	),
	active(
		"invalid-stream-error-details-field",
		{
			kind: "stream-error",
			streamId: "1",
			itemThrough: 0,
			error: { code: "overflow", message: "safe", details: null },
		},
		"invalid",
	),
];

const maximumDigits = "9007199254740991";
const maximumMethodSegments = [
	{
		utf8: `{"kind":"message","seq":${maximumDigits},"ackThrough":${maximumDigits},"message":{"kind":"stream-method","streamId":"${maximumDigits}","service":"`,
	},
	{ repeatUtf8: "\\u0000", count: 256 },
	{ utf8: "\",\"member\":\"" },
	{ repeatUtf8: "\\u0000", count: 256 },
	{ utf8: "\",\"args\":[\"" },
	{ repeatUtf8: "\\u0000", count: 166_666 },
	{ utf8: "\"],\"creditThrough\":1}}" },
];
const maximumItemSegments = [
	{
		utf8: `{"kind":"message","seq":${maximumDigits},"ackThrough":${maximumDigits},"message":{"kind":"stream-item","streamId":"${maximumDigits}","itemOrdinal":9007199254740991,"value":["`,
	},
	{ repeatUtf8: "\\u0000", count: 166_666 },
	{ utf8: "\"]}}" },
];
const renderLength = (segments) =>
	Buffer.concat(
		segments.map((segment) =>
			Buffer.from(
				"utf8" in segment
					? segment.utf8
					: segment.repeatUtf8.repeat(segment.count),
				"utf8",
			),
		),
	).byteLength;
if (renderLength(maximumMethodSegments) !== 1_003_259) {
	throw new Error("Maximum stream-method envelope proof drifted.");
}
if (renderLength(maximumItemSegments) !== 1_000_174) {
	throw new Error("Maximum stream-item envelope proof drifted.");
}
const boundaryVector = (id, segments, expectedLength) => ({
	id,
	validity: "valid",
	validator: "active",
	source: { segments },
	expectedKind: "message",
	expectedByteLength: expectedLength,
	covers: ["RPC-CORPUS-006", "RPC-WIRE-023", "RPC-VALID-009", "limit"],
});
const createNodeEnvelope = (leafCount) => {
	const chunks = [];
	let remaining = leafCount;
	for (let index = 0; index < 8; index += 1) {
		const length = Math.min(8192, remaining);
		chunks.push(Array.from({ length }, () => null));
		remaining -= length;
	}
	return JSON.stringify({
		kind: "message",
		seq: 1,
		ackThrough: 0,
		message: {
			kind: "stream-method",
			streamId: "1",
			service: "s",
			member: "m",
			args: chunks,
			creditThrough: 1,
		},
	});
};
const boundaryVectors = [
	boundaryVector(
		"valid-max-stream-method-envelope",
		maximumMethodSegments,
		1_003_259,
	),
	boundaryVector(
		"valid-max-stream-item-envelope",
		maximumItemSegments,
		1_000_174,
	),
	{
		...active("valid-max-node-limit", {
			kind: "stream-method",
			streamId: "1",
			service: "s",
			member: "m",
			args: [],
			creditThrough: 1,
		}),
		source: { segments: [{ utf8: createNodeEnvelope(65_527) }] },
		expectedNodeCount: 65_546,
		covers: ["RPC-CORPUS-006", "RPC-WIRE-023", "RPC-VALID-009", "limit"],
	},
	{
		...active(
			"invalid-max-node-limit-plus-one",
			{ kind: "stream-cancel", streamId: "1" },
			"invalid",
		),
		source: { segments: [{ utf8: createNodeEnvelope(65_528) }] },
		expectedNodeCount: 65_547,
		covers: ["RPC-CORPUS-006", "RPC-WIRE-023", "RPC-VALID-009", "limit"],
	},
];

const errorIndex = baseVectors.findIndex(
	(vector) => vector.id === "valid-safe-error-without-details",
);
baseVectors.splice(errorIndex + 1, 0, invalidDetails);
const finalVectors = [...baseVectors, ...streamVectors, ...boundaryVectors];
if (finalVectors.length !== 82 || new Set(finalVectors.map(({ id }) => id)).size !== 82) {
	throw new Error("Final raw corpus must contain exactly 82 unique vectors.");
}
await writeFile(
	assetUrl,
	`${JSON.stringify({ ...corpus, vectors: finalVectors }, null, 2)}\n`,
);

const transcriptsUrl = new URL(
	"../wire/husky-di-rpc-1/transcripts.json",
	import.meta.url,
);
const transcriptCorpus = JSON.parse(await readFile(transcriptsUrl, "utf8"));
const scenarioRenames = new Map([
	["fresh-establishment", "unary-fresh-establishment"],
	["lost-fresh-accept", "unary-lost-fresh-accept"],
	["normal-resume-and-replay-barrier", "unary-normal-resume-and-replay-barrier"],
	["lost-resume-accept-higher-attempt", "unary-lost-resume-accept-higher-attempt"],
	["lost-ack-and-ack-bounds", "unary-lost-ack-and-ack-bounds"],
	["sequence-gap", "unary-sequence-gap"],
	["regressed-sequence-conflicting-body", "unary-regressed-sequence-conflicting-body"],
	["authenticated-cursor-boundaries", "session-authenticated-cursor-boundaries"],
	["generic-resume-rejects", "session-generic-resume-rejects"],
	["authenticated-continuity-reject", "session-authenticated-continuity-reject"],
	["stale-connection-epoch-gate", "session-stale-connection-epoch-gate"],
	["activity-ping-pong", "session-activity-ping-pong"],
	["graceful-close", "session-graceful-close"],
	["counter-exhaustion-drain", "session-counter-exhaustion-protected-tail"],
]);
const publicProjection = (consequence) => ({
	consequence,
	ack: "captured-outbound-only",
	routeCount: "public-count",
	sourceCount: "public-count",
	observerCount: "public-count",
	callerCount: "public-count",
	liveness: "fresh-branch-required",
});
const normalizeStep = (step) => step.independentExpected === undefined ? ({
	id: step.id,
	action: step.action,
	independentExpected: {
		state: step.assert,
		effects: { disposition: "deliver-once-or-suppressed", laterEffect: "fenced" },
		resources: { receiveSlot: "modelled", retainedBytes: "modelled" },
		counters: { sequence: "modelled", ordinal: "modelled-never-wrap" },
		credit: { window: 1, cumulative: "modelled" },
		evidence: { receipt: "modelled", replay: "modelled" },
		nextPermittedRecords: step.assert?.nextPermittedRecords ?? {},
	},
	publicProjection: publicProjection("stable-public-branch-consequence"),
}) : step;
const finalLegacyScenarioIds = new Set(scenarioRenames.values());
const legacyScenarios = transcriptCorpus.scenarios
	.filter(
		(scenario) =>
			scenarioRenames.has(scenario.id) || finalLegacyScenarioIds.has(scenario.id),
	)
	.map((scenario) => ({
		...scenario,
		id: scenarioRenames.get(scenario.id) ?? scenario.id,
		steps: scenario.steps.map(normalizeStep),
	}));

const streamStep = (id, action, consequence, model = {}) => ({
	id,
	action: { type: action },
	independentExpected: {
		state: { session: "active", stream: "retained", ...model.state },
		effects: {
			disposition: "deliver-once-or-suppressed",
			laterEffect: "fenced-after-terminal",
			...model.effects,
		},
		resources: {
			receiveSlot: "single-credit-backed",
			retainedBytes: "stage-owned",
			protectedTail: "available",
			...model.resources,
		},
		counters: {
			sequence: "contiguous-never-wrap",
			streamOrdinal: "direction-local-contiguous",
			itemOrdinal: "contiguous",
			...model.counters,
		},
		credit: { window: 1, cumulative: "exact-next-horizon", ...model.credit },
		evidence: {
			receipt: "cumulative-message-ack",
			replay: "original-sequence",
			...model.evidence,
		},
		nextPermittedRecords: model.nextPermittedRecords ?? [
			"stream-item",
			"stream-credit",
			"stream-cancel",
			"stream-complete",
			"stream-error",
		],
	},
	publicProjection: publicProjection(consequence),
});
const streamScenario = (id, covers, first, second) => ({
	id,
	covers: ["RPC-CORPUS-007", "RPC-CORPUS-011", ...covers],
	steps: [first, second],
});
const streamScenarios = [
	streamScenario(
		"method-property-mismatch",
		["RPC-WIRE-018", "RPC-WIRE-020", "RPC-WIRE-021"],
		streamStep("method-start-on-property", "deliver", "safe-unknown-member-no-route"),
		streamStep("property-with-args-faults", "deliver", "session-fault-no-ack"),
	),
	streamScenario(
		"w1-burst-overcredit",
		["RPC-WIRE-019", "RPC-WIRE-020", "RPC-WIRE-021"],
		streamStep("first-item-consumes-credit", "emit", "one-observer-item"),
		streamStep("second-burst-selects-overflow", "emit", "safe-overflow-terminal"),
	),
	streamScenario(
		"next-unsubscribe",
		["RPC-WIRE-019", "RPC-WIRE-021"],
		streamStep("item-effect-enters-next", "deliver", "one-observer-item"),
		streamStep("reentrant-unsubscribe-suppresses-credit", "unsubscribe", "one-cancel-no-credit"),
	),
	streamScenario(
		"lost-item-vs-ack",
		["RPC-ACK-005", "RPC-LEDGER-005", "RPC-WIRE-021"],
		streamStep("item-send-is-retained", "send", "captured-item-sequence"),
		streamStep("recovery-replays-unacknowledged-item", "recover", "same-item-sequence-once"),
	),
	streamScenario(
		"replay-equivocation-gc",
		["RPC-ACK-005", "RPC-WIRE-021", "RPC-WIRE-022"],
		streamStep("duplicate-fingerprint-is-suppressed", "replay", "no-second-effect"),
		streamStep("equivocation-before-gc-faults", "deliver", "session-fault-no-ack"),
	),
	streamScenario(
		"recovery-bidirectional-barrier",
		["RPC-ACK-005", "RPC-LEDGER-005", "RPC-SCHEDULE-006"],
		streamStep("barriers-freeze-both-directions", "disconnect", "recovering-no-resubscribe"),
		streamStep("barriers-drain-before-fresh-progress", "recover", "original-sequences-before-new"),
	),
	streamScenario(
		"cancel-complete-race",
		["RPC-WIRE-019", "RPC-WIRE-020", "RPC-WIRE-021", "RPC-WIRE-022"],
		streamStep("cancel-wins-first-terminal", "cancel", "one-canceled-terminal"),
		streamStep("late-complete-only-retires-evidence", "deliver", "no-second-terminal"),
	),
	streamScenario(
		"terminal-late-credit",
		["RPC-WIRE-019", "RPC-WIRE-022"],
		streamStep("terminal-commits-boundary", "deliver", "one-terminal"),
		streamStep("late-equal-credit-is-absorbed", "deliver", "session-remains-live"),
	),
	streamScenario(
		"retired-controls",
		["RPC-LEDGER-005", "RPC-WIRE-022"],
		streamStep("terminal-ack-retires-identity", "ack", "terminal-evidence-retired"),
		streamStep("late-control-does-not-revive", "deliver", "no-route-source-or-observer"),
	),
	streamScenario(
		"opposite-direction-same-id",
		["RPC-WIRE-018", "RPC-WIRE-022"],
		streamStep("both-directions-admit-stream-one", "start", "two-independent-sources"),
		streamStep("one-direction-terminal-is-local", "deliver", "opposite-stream-remains-live"),
	),
	streamScenario(
		"protected-tail",
		["RPC-COUNTER-002", "RPC-RESOURCE-003", "RPC-SCHEDULE-006"],
		streamStep(
			"ordinary-work-stops-at-protected-window",
			"counter-boundary",
			"draining-transition",
			{ counters: { sequence: "L" }, resources: { protectedTail: "reserved" } },
		),
		streamStep(
			"terminal-and-cancel-converge-without-wrap",
			"drain",
			"terminal-cancel-close-order",
			{ counters: { sequence: "H-or-lower" } },
		),
	),
	streamScenario(
		"max-envelope",
		["RPC-CORPUS-009", "RPC-WIRE-023"],
		streamStep(
			"maximum-method-and-item-envelopes-pass",
			"inject-boundary",
			"reachable-stable-projection",
			{ resources: { envelopeBytes: [1_003_259, 1_000_174] } },
		),
		streamStep(
			"one-mib-plus-one-and-node-plus-one-fail",
			"inject-boundary-plus-one",
			"public-protocol-fault-no-ack",
			{ resources: { maximumMessageBytes: 1_048_576, maximumNodes: 65_546 } },
		),
	),
	streamScenario(
		"shutdown-g-f-close",
		["RPC-SHUTDOWN-012", "RPC-VALID-009", "RPC-WIRE-024"],
		streamStep("g-valid-start-selects-unavailable", "graceful-shutdown", "no-route-safe-unavailable"),
		streamStep("f-fences-egress-and-orders-close", "force", "no-egress-one-ordered-close"),
	),
];
const finalScenarios = [...legacyScenarios, ...streamScenarios];
const transcriptSelectors = finalScenarios.flatMap((scenario) =>
	scenario.steps.map((step) => `${scenario.id}#${step.id}`),
);
if (
	transcriptSelectors.length !== 68 ||
	new Set(transcriptSelectors).size !== transcriptSelectors.length
) {
	throw new Error("Final transcript corpus must contain exactly 68 unique steps.");
}
await writeFile(
	transcriptsUrl,
	`${JSON.stringify({ ...transcriptCorpus, scenarios: finalScenarios }, null, 2)}\n`,
);

const knownAnswersUrl = new URL(
	"../wire/husky-di-rpc-1/known-answer-vectors.json",
	import.meta.url,
);
const knownAnswers = JSON.parse(await readFile(knownAnswersUrl, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const generatorArtifact = {
	path: "scripts/generate-rpc-wire-corpus.mjs",
	sha256: sha256(await readFile(new URL(import.meta.url))),
};
const katProvenance = (source, input, output) => ({
	source,
	generatorArtifact,
	inputSha256: sha256(Buffer.from(JSON.stringify(input))),
	outputSha256: sha256(Buffer.from(JSON.stringify(output))),
});
const securityActions = [
	{
		id: "stream-cursor-lost-ack",
		action: "lose item receipt ACK, recover, replay original sequence",
		expected: "one Observer item and cumulative ACK convergence",
	},
	{
		id: "old-binding-fence",
		action: "deliver active bytes on a superseded Connection",
		expected: "no Codec, route, Source, Observer, caller, or ACK effect",
	},
	{
		id: "wrong-proof-retains-stream",
		action: "submit a resume proof mutation while a Source is retained",
		expected: "generic rejection and the original Source remains retained",
	},
	{
		id: "recovery-terminal-no-resubscribe",
		action: "Source terminal wins while the binding is recovering",
		expected: "one teardown, retained terminal replay, zero reacquisition",
	},
	{
		id: "post-g-validation-order",
		action: "inject malformed, wrong-binding, gap, and valid starts after G",
		expected: "validation faults precede safe unavailable rejection",
	},
	{
		id: "protected-transport-no-record-mac",
		action: "inspect every active record in a protected Transport",
		expected: "no record MAC field and unchanged Transport seam",
	},
	{
		id: "payload-error-redaction",
		action: "fail a Source with an Error carrying private details",
		expected: "fixed safe code/message only; no raw detail projection",
	},
].map((action) => ({
	...action,
	provenance: {
		model: "independent action-prefix oracle",
		authority: "RPC-CORPUS-008",
		generatorArtifact,
		actionSha256: sha256(Buffer.from(action.action)),
		expectedSha256: sha256(Buffer.from(action.expected)),
	},
}));
const jcs = knownAnswers.jcs.map((vector) => ({
	...vector,
	provenance: katProvenance(
		vector.id.startsWith("rfc8785") ? "RFC 8785" : vector.id,
		vector.input,
		vector.canonical,
	),
}));
const hkdfSha256 = {
	...knownAnswers.hkdfSha256,
	provenance: katProvenance(
		"RFC 5869 appendix A.1",
		{
			ikmHex: knownAnswers.hkdfSha256.ikmHex,
			saltHex: knownAnswers.hkdfSha256.saltHex,
			infoHex: knownAnswers.hkdfSha256.infoHex,
			length: knownAnswers.hkdfSha256.length,
		},
		knownAnswers.hkdfSha256.okmHex,
	),
};
const hmacSha256 = {
	...knownAnswers.hmacSha256,
	provenance: katProvenance(
		"RFC 4231 section 4.2 test case 1",
		{
			keyHex: knownAnswers.hmacSha256.keyHex,
			dataHex: knownAnswers.hmacSha256.dataHex,
		},
		knownAnswers.hmacSha256.tagHex,
	),
};
const profileTranscript = {
	...knownAnswers.profileTranscript,
	provenance: katProvenance(
		"husky-di-rpc/1 RPC-SEC-002 transcript",
		{
			sessionSecretHex: knownAnswers.profileTranscript.sessionSecretHex,
			freshRequest: knownAnswers.profileTranscript.freshRequest,
			freshAccept: knownAnswers.profileTranscript.freshAccept,
			resumeRequest: knownAnswers.profileTranscript.resumeRequest,
			resumeAccept: knownAnswers.profileTranscript.resumeAccept,
			authenticatedReject:
				knownAnswers.profileTranscript.authenticatedReject,
		},
		{
			proofKeyHex: knownAnswers.profileTranscript.proofKeyHex,
			freshAcceptProof: knownAnswers.profileTranscript.freshAcceptProof,
			resumeRequestProof: knownAnswers.profileTranscript.resumeRequestProof,
			resumeAcceptProof: knownAnswers.profileTranscript.resumeAcceptProof,
			authenticatedRejectProof:
				knownAnswers.profileTranscript.authenticatedRejectProof,
		},
	),
};
const finalKnownAnswers = {
	...knownAnswers,
	jcs,
	hkdfSha256,
	hmacSha256,
	profileTranscript,
	provenance: {
		jcs: "RFC 8785 sections 3.2.2 and 3.2.3",
		hkdfSha256: "RFC 5869 appendix A.1",
		hmacSha256: "RFC 4231 section 4.2 test case 1",
		profileTranscript:
			"Independent Python 3 hashlib/hmac/JCS-compatible recomputation",
	},
	securityActions,
};
await writeFile(
	knownAnswersUrl,
	`${JSON.stringify(finalKnownAnswers, null, 2)}\n`,
);

const publicAssetNames = [
	"schema.json",
	"raw-vectors.json",
	"transcripts.json",
	"known-answer-vectors.json",
];
const publicAssets = [];
for (const name of publicAssetNames) {
	const bytes = await readFile(new URL(`../wire/husky-di-rpc-1/${name}`, import.meta.url));
	publicAssets.push({ name, bytes: bytes.byteLength, sha256: sha256(bytes) });
}
const metaschemaFiles = [
	["https://json-schema.org/draft/2020-12/schema", "schema.json"],
	["https://json-schema.org/draft/2020-12/meta/core", "meta/core.json"],
	["https://json-schema.org/draft/2020-12/meta/applicator", "meta/applicator.json"],
	["https://json-schema.org/draft/2020-12/meta/unevaluated", "meta/unevaluated.json"],
	["https://json-schema.org/draft/2020-12/meta/validation", "meta/validation.json"],
	["https://json-schema.org/draft/2020-12/meta/meta-data", "meta/meta-data.json"],
	["https://json-schema.org/draft/2020-12/meta/format-annotation", "meta/format-annotation.json"],
	["https://json-schema.org/draft/2020-12/meta/content", "meta/content.json"],
];
const metaschemaClosure = [];
for (const [uri, path] of metaschemaFiles) {
	const bytes = await readFile(
		new URL(
			`../../../node_modules/.pnpm/ajv@8.18.0/node_modules/ajv/dist/refs/json-schema-2020-12/${path}`,
			import.meta.url,
		),
	);
	metaschemaClosure.push({
		uri,
		sha256: sha256(bytes),
		bytesBase64: bytes.toString("base64"),
	});
}
const internalRevision = sha256(
	Buffer.from(publicAssets.map(({ sha256: digest }) => digest).join("\n")),
);
const manifest = {
	profile: "husky-di-rpc/1",
	internalRevision,
	publicAssets,
	validator: {
		name: "ajv",
		version: "8.18.0",
		mode: "offline-draft-2020-12",
	},
	metaschemaClosure,
	cardinality: {
		independentRawResults: 82,
		rawPublicProjectionResults: 82,
		independentTranscriptResults: 68,
		transcriptPublicProjectionResults: 62,
		transcriptOracleOnlySelectors: 6,
	},
};
await writeFile(
	new URL("../tests/wire/corpus-manifest.json", import.meta.url),
	`${JSON.stringify(manifest, null, "\t")}\n`,
);
