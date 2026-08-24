/**
 * @overview Builds and audits the immutable Remote RPC requirement evidence graph.
 * @author AEPKILL
 * @created 2026-08-24 21:05:00
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
	fileURLToPath(new URL("../../../", import.meta.url)),
);
const packageRoot = resolve(repositoryRoot, "packages/remote");
const specificationPath = resolve(packageRoot, "docs/SPECIFICATION.md");
const supportManifestPath = resolve(
	repositoryRoot,
	".scratch/remote-observable-streams/support/legacy-preserved-requirement-boundaries.json",
);
const evidenceRoot = resolve(packageRoot, "evidence");
const executionResultsPath = resolve(evidenceRoot, "execution-results.json");
const requirementPattern = /^RPC-[A-Z]+-[0-9]{3}$/u;
const supportManifestSha256 =
	"3b11a2432026fc4dc0833c1425041a4caf1900dea1a0afc7bfe7f3247f550b66";

const NEW_REQUIREMENT_RANGES = Object.freeze({
	VALUE: [[7, 8]],
	DESC: [[6, 13]],
	STATE: [[4, 4]],
	CALL: [[10, 15]],
	API: [[7, 8]],
	STREAM: [[1, 15]],
	FLOW: [[1, 6]],
	LEDGER: [[6, 8]],
	ACK: [[8, 15]],
	RECOVERY: [[7, 9]],
	SEC: [[10, 11]],
	VALID: [[8, 10]],
	POLICY: [[5, 9]],
	RESOURCE: [[7, 20]],
	SCHEDULE: [[7, 9]],
	COUNTER: [[5, 6]],
	SHUTDOWN: [[11, 17]],
	CLOSE: [[4, 7]],
	CLEANUP: [[5, 5]],
	LIFE: [[3, 3]],
	EVENT: [
		[8, 18],
		[21, 23],
	],
	SPI: [[13, 22]],
	TRANSPORT: [[13, 13]],
	CONFORMANCE: [[4, 5]],
	WIRE: [[16, 26]],
	CORPUS: [[5, 12]],
	EVIDENCE: [[4, 15]],
	PKG: [[10, 15]],
	RELEASE: [[6, 25]],
	MIGRATION: [[1, 4]],
	DOC: [[1, 6]],
});

const RETIRED_REQUIREMENT_REPLACEMENTS = Object.freeze({
	"RPC-BASE-002": ["RPC-STREAM-001", "RPC-STREAM-003", "RPC-EVENT-008"],
	"RPC-PKG-007": ["RPC-PKG-010"],
	"RPC-PKG-008": ["RPC-PKG-011"],
	"RPC-PKG-009": ["RPC-PKG-012", "RPC-PKG-014", "RPC-PKG-015"],
	"RPC-VALUE-001": ["RPC-VALUE-007"],
	"RPC-VALUE-004": ["RPC-VALUE-008", "RPC-WIRE-023"],
	"RPC-DESC-002": [
		"RPC-DESC-006",
		"RPC-DESC-007",
		"RPC-DESC-010",
		"RPC-DESC-011",
		"RPC-DESC-012",
		"RPC-DESC-013",
	],
	"RPC-DESC-003": ["RPC-DESC-009"],
	"RPC-DESC-004": ["RPC-DESC-008", "RPC-DESC-009"],
	"RPC-STATE-001": ["RPC-STATE-004"],
	"RPC-CALL-001": ["RPC-CALL-010", "RPC-CALL-011", "RPC-API-007"],
	"RPC-CALL-003": ["RPC-CALL-012"],
	"RPC-CALL-007": ["RPC-CALL-013", "RPC-CALL-014", "RPC-STREAM-010"],
	"RPC-CALL-009": ["RPC-CALL-015"],
	"RPC-GROUP-001": [],
	"RPC-GROUP-002": [],
	"RPC-GROUP-003": [],
	"RPC-EVENT-001": ["RPC-EVENT-021", "RPC-EVENT-009"],
	"RPC-EVENT-002": ["RPC-EVENT-022", "RPC-EVENT-010"],
	"RPC-EVENT-003": ["RPC-EVENT-023", "RPC-EVENT-010"],
	"RPC-EVENT-004": ["RPC-EVENT-012"],
	"RPC-SPI-007": ["RPC-SPI-021", "RPC-SPI-022"],
	"RPC-WIRE-005": ["RPC-WIRE-025"],
	"RPC-WIRE-006": ["RPC-WIRE-016", "RPC-WIRE-026"],
	"RPC-WIRE-011": ["RPC-WIRE-018", "RPC-WIRE-023"],
	"RPC-WIRE-012": ["RPC-WIRE-020"],
	"RPC-VALID-007": ["RPC-VALID-010"],
	"RPC-RESOURCE-001": ["RPC-RESOURCE-007"],
	"RPC-RESOURCE-002": ["RPC-RESOURCE-008"],
	"RPC-RESOURCE-003": [
		"RPC-RESOURCE-007",
		"RPC-POLICY-006",
		"RPC-POLICY-007",
	],
	"RPC-RESOURCE-005": ["RPC-RESOURCE-007", "RPC-RESOURCE-008"],
	"RPC-POLICY-001": [
		"RPC-POLICY-005",
		"RPC-POLICY-006",
		"RPC-POLICY-007",
		"RPC-POLICY-008",
	],
	"RPC-POLICY-002": ["RPC-RESOURCE-007", "RPC-RESOURCE-008"],
	"RPC-POLICY-003": ["RPC-POLICY-009"],
	"RPC-SCHEDULE-002": ["RPC-SCHEDULE-007", "RPC-SCHEDULE-008"],
	"RPC-COUNTER-002": ["RPC-COUNTER-005"],
	"RPC-SHUTDOWN-001": [
		"RPC-SHUTDOWN-011",
		"RPC-SHUTDOWN-012",
		"RPC-SHUTDOWN-015",
	],
	"RPC-SHUTDOWN-004": ["RPC-SHUTDOWN-016"],
	"RPC-SHUTDOWN-005": ["RPC-SHUTDOWN-014"],
	"RPC-SHUTDOWN-009": ["RPC-SHUTDOWN-017"],
	"RPC-CLOSE-001": ["RPC-CLOSE-004", "RPC-CLOSE-005", "RPC-CLOSE-006"],
	"RPC-EVIDENCE-002": ["RPC-EVIDENCE-006", "RPC-EVIDENCE-011"],
	"RPC-EVIDENCE-003": ["RPC-EVIDENCE-012"],
	"RPC-CONFORMANCE-002": ["RPC-CONFORMANCE-004"],
	"RPC-CONFORMANCE-003": ["RPC-CONFORMANCE-005"],
	"RPC-CORPUS-002": ["RPC-CORPUS-007"],
	"RPC-CORPUS-004": ["RPC-CORPUS-009"],
	"RPC-RELEASE-001": [
		"RPC-DESC-007",
		"RPC-DESC-010",
		"RPC-DESC-011",
		"RPC-DESC-012",
		"RPC-DESC-013",
		"RPC-RELEASE-009",
		"RPC-RELEASE-016",
		"RPC-RELEASE-017",
	],
});

const TRANSCRIPT_REPLACEMENTS = Object.freeze({
	"fresh-establishment": "unary-fresh-establishment",
	"lost-fresh-accept": "unary-lost-fresh-accept",
	"normal-resume-and-replay-barrier":
		"unary-normal-resume-and-replay-barrier",
	"lost-resume-accept-higher-attempt":
		"unary-lost-resume-accept-higher-attempt",
	"lost-ack-and-ack-bounds": "unary-lost-ack-and-ack-bounds",
	"sequence-gap": "unary-sequence-gap",
	"regressed-sequence-conflicting-body":
		"unary-regressed-sequence-conflicting-body",
	"authenticated-cursor-boundaries": "session-authenticated-cursor-boundaries",
	"generic-resume-rejects": "session-generic-resume-rejects",
	"authenticated-continuity-reject":
		"session-authenticated-continuity-reject",
	"stale-connection-epoch-gate": "session-stale-connection-epoch-gate",
	"activity-ping-pong": "session-activity-ping-pong",
	"graceful-close": "session-graceful-close",
	"counter-exhaustion-drain": "session-counter-exhaustion-protected-tail",
});

const RAW_REPLACEMENTS = Object.freeze({
	"valid-call-with-unknown-tails": ["valid-unary-call-with-unknown-tails"],
	"valid-safe-error": [
		"valid-safe-error-without-details",
		"invalid-error-details-field",
	],
	"valid-number-domain": ["valid-unary-number-domain"],
	"valid-application-args-depth-limit": [
		"valid-unary-application-args-depth-limit",
	],
	"valid-array-element-limit": ["valid-unary-array-element-limit"],
	"invalid-reserved-then-method": ["invalid-reserved-then-member"],
	"invalid-application-args-depth-limit-plus-one": [
		"invalid-unary-application-args-depth-limit-plus-one",
	],
	"invalid-array-element-limit-plus-one": [
		"invalid-unary-array-element-limit-plus-one",
	],
});

const PROTOCOL_PRESERVED_CASES = Object.freeze([
	"protocol.construction.immutable",
	"protocol.construction.connector-fresh-non-reentrant",
	"protocol.construction.acceptor-fresh-non-reentrant",
	"protocol.handoff.subscribe-before-install",
	"protocol.values.normalized-snapshots",
	"protocol.outgoing.reserve-commit-start-sink",
	"protocol.incoming.resource-disposition",
	"protocol.incoming.semantic-unknown-service",
	"protocol.incoming.handler-dispositions-permit",
	"protocol.fault.active-session-scope",
	"protocol.counter.first-call-drains",
	"protocol.termination.shutdown-phase",
	"protocol.termination.close-phase",
	"protocol.termination.cleanup-cached",
]);

const ADAPTER_GRANDFATHERED_CASES = Object.freeze([
	"RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.handoff.subscribe-before-start",
	"RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.source.multicast-terminal-single-use",
	"RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 connector.message.identity-order-hot-terminal",
	"RPC-TRANSPORT-001 RPC-TRANSPORT-003 connector.message.error-identity-terminal",
	"RPC-TRANSPORT-005 RPC-TRANSPORT-006 connector.send.local-admission-backpressure",
	"RPC-TRANSPORT-006 connector.send.one-mebibyte-compatibility",
	"RPC-TRANSPORT-003 RPC-TRANSPORT-007 connector.close.direct-idempotent-race",
	"RPC-TRANSPORT-008 connector.start.abort-before-handoff",
	"RPC-TRANSPORT-003 RPC-TRANSPORT-008 connector.start.failure-error-identity",
	"RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.start.abort-after-handoff-no-revocation",
	"RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.handoff.subscribe-before-start-early-accept",
	"RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.source.multicast-order-hot-terminal",
	"RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 acceptor.message.identity-order-hot-terminal",
	"RPC-TRANSPORT-001 RPC-TRANSPORT-003 acceptor.message.error-identity-terminal",
	"RPC-TRANSPORT-005 RPC-TRANSPORT-006 acceptor.send.local-admission-backpressure",
	"RPC-TRANSPORT-006 acceptor.send.one-mebibyte-compatibility",
	"RPC-TRANSPORT-003 RPC-TRANSPORT-007 acceptor.close.direct-idempotent-race",
	"RPC-TRANSPORT-009 acceptor.start.abort-before-ready",
	"RPC-TRANSPORT-009 acceptor.start.abort-after-ready",
	"RPC-TRANSPORT-009 acceptor.start.complete-before-ready",
	"RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.start.failure-error-identity",
	"RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.listener.failure-after-ready-no-revocation",
	"RPC-TRANSPORT-010 acceptor.connection.failure-isolation",
	"RPC-TRANSPORT-007 RPC-TRANSPORT-009 RPC-TRANSPORT-011 acceptor.overflow.abort-inside-handoff",
]);

const KAT_PRESERVED_CASES = Object.freeze([
	"rfc8785-section-3.2.2",
	"rfc8785-section-3.2.3-utf16-property-order",
	"rfc5869-appendix-a.1",
	"rfc4231-section-4.2-test-case-1",
	"husky-di-rpc-1-proof-transcript",
]);

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function json(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function duplicateValues(values) {
	const seen = new Set();
	const duplicates = new Set();
	for (const value of values) {
		if (seen.has(value)) {
			duplicates.add(value);
		}
		seen.add(value);
	}
	return [...duplicates];
}

function expandNewRequirementIds() {
	const ids = [];
	for (const [family, ranges] of Object.entries(NEW_REQUIREMENT_RANGES)) {
		for (const [start, end] of ranges) {
			for (let ordinal = start; ordinal <= end; ordinal += 1) {
				ids.push(`RPC-${family}-${String(ordinal).padStart(3, "0")}`);
			}
		}
	}
	return ids;
}

function getVerificationProfile(id, preservedIds) {
	if (preservedIds.has(id)) {
		return { owner: "baseline-owner", prefix: "runtime.legacy" };
	}
	const family = id.split("-")[1];
	if (["VALUE", "DESC", "STATE", "CALL", "API", "POLICY"].includes(family)) {
		return { owner: "Framework", prefix: "type" };
	}
	if (
		[
			"STREAM",
			"FLOW",
			"RESOURCE",
			"SHUTDOWN",
			"CLOSE",
			"CLEANUP",
			"LIFE",
			"EVENT",
		].includes(family)
	) {
		return { owner: "Framework", prefix: "runtime" };
	}
	if (
		[
			"LEDGER",
			"ACK",
			"RECOVERY",
			"SCHEDULE",
			"COUNTER",
			"SPI",
			"CONFORMANCE",
		].includes(family)
	) {
		return { owner: "Protocol", prefix: "protocol" };
	}
	if (family === "TRANSPORT") {
		return { owner: "Transport Adapter", prefix: "transport" };
	}
	if (["SEC", "VALID", "WIRE"].includes(family)) {
		return { owner: "built-in Protocol/corpus", prefix: "raw" };
	}
	if (["CORPUS", "EVIDENCE"].includes(family)) {
		return { owner: "release-evidence", prefix: "runtime" };
	}
	if (["PKG", "RELEASE", "MIGRATION"].includes(family)) {
		return { owner: "package-release", prefix: "package" };
	}
	if (family === "DOC") {
		return { owner: "docs-migration", prefix: "doc" };
	}
	throw new Error(`No verification profile for ${id}`);
}

function caseSlug(id) {
	return id.toLowerCase().replace(/^rpc-/u, "").replaceAll("-", "-");
}

export function parseSpecificationBlocks(sourceBytes, retiredIds) {
	if (sourceBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
		throw new Error("SPECIFICATION.md must not contain a UTF-8 BOM");
	}
	if (sourceBytes.includes(0x0d)) {
		throw new Error("SPECIFICATION.md must use LF without CR bytes");
	}
	const source = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);

	const retired = new Set(retiredIds);
	for (const id of retired) {
		if (source.includes(`**${id} —`) || source.includes(`<!-- /${id} -->`)) {
			throw new Error(`Retired Requirement marker remains in SPECIFICATION.md: ${id}`);
		}
	}
	const blocks = new Map();
	let open;
	let lineStart = 0;
	while (lineStart < sourceBytes.length) {
		const nextLf = sourceBytes.indexOf(0x0a, lineStart);
		const lineEnd = nextLf === -1 ? sourceBytes.length : nextLf;
		const line = sourceBytes.subarray(lineStart, lineEnd).toString("utf8");
		const opening = /^\*\*(RPC-[A-Z]+-[0-9]{3})\s+—/u.exec(line);
		const close = /^<!-- \/(RPC-[A-Z]+-[0-9]{3}) -->$/u.exec(line);
		if (opening === null && line.startsWith("**RPC-")) {
			throw new Error(`Malformed Requirement opening at byte ${lineStart}`);
		}
		if (close === null && line.startsWith("<!-- /RPC-")) {
			throw new Error(`Malformed Requirement close at byte ${lineStart}`);
		}

		if (opening !== null) {
			const id = opening[1];
			if (retired.has(id)) {
				throw new Error(`Retired Requirement opening remains in SPECIFICATION.md: ${id}`);
			}
			if (open !== undefined) {
				throw new Error(`Nested Requirement opening ${id} before closing ${open.id}`);
			}
			if (blocks.has(id)) {
				throw new Error(`Duplicate Requirement opening: ${id}`);
			}
			open = { id, startByte: lineStart };
		} else if (close !== null) {
			const id = close[1];
			if (retired.has(id)) {
				throw new Error(`Retired Requirement close remains in SPECIFICATION.md: ${id}`);
			}
			if (open === undefined) {
				throw new Error(`Orphan Requirement close: ${id}`);
			}
			if (open.id !== id) {
				throw new Error(`Mismatched Requirement close ${id} for ${open.id}`);
			}
			if (nextLf === -1 || lineEnd + 1 > sourceBytes.length) {
				throw new Error(`Requirement close must end with LF: ${id}`);
			}
			if (
				lineStart < 2 ||
				sourceBytes[lineStart - 1] !== 0x0a ||
				sourceBytes[lineStart - 2] === 0x0a
			) {
				throw new Error(`Requirement close must have one structural LF: ${id}`);
			}
			const endByteExclusive = lineStart - 1;
			const payload = sourceBytes.subarray(open.startByte, endByteExclusive);
			blocks.set(id, {
				id,
				startByte: open.startByte,
				endByteExclusive,
				proposition: payload.toString("utf8"),
				propositionSha256: sha256(payload),
			});
			open = undefined;
		}
		lineStart = nextLf === -1 ? sourceBytes.length : nextLf + 1;
	}
	if (open !== undefined) {
		throw new Error(`Missing Requirement close: ${open.id}`);
	}
	return blocks;
}

function parseBaselinePropositions(sourceBytes) {
	const source = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
	const starts = [...source.matchAll(/^\*\*(RPC-[A-Z]+-[0-9]{3})\s+—/gmu)].map(
		(match) => ({ id: match[1], start: match.index }),
	);
	const headings = [...source.matchAll(/^#{1,6}\s+/gmu)].map(
		(match) => match.index,
	);
	const propositions = new Map();
	for (let index = 0; index < starts.length; index += 1) {
		const current = starts[index];
		const nextOpening = starts[index + 1]?.start ?? source.length;
		const nextHeading = headings.find((offset) => offset > current.start) ?? source.length;
		let end = Math.min(nextOpening, nextHeading);
		while (end > current.start && source[end - 1] === "\n") {
			end -= 1;
		}
		propositions.set(current.id, source.slice(current.start, end));
	}
	return propositions;
}

function readBaselineFile(commit, path) {
	return execFileSync("git", ["show", `${commit}:${path}`], {
		cwd: repositoryRoot,
		encoding: null,
	});
}

function buildLegacyVerdicts(baselineCommit) {
	const raw = JSON.parse(
		readBaselineFile(
			baselineCommit,
			"packages/remote/wire/husky-di-rpc-1/raw-vectors.json",
		).toString("utf8"),
	);
	const transcripts = JSON.parse(
		readBaselineFile(
			baselineCommit,
			"packages/remote/wire/husky-di-rpc-1/transcripts.json",
		).toString("utf8"),
	);
	const rawIds = raw.vectors.map((vector) => vector.id);
	const retiredRawIds = new Set(Object.keys(RAW_REPLACEMENTS));
	const transcriptScenarios = transcripts.scenarios.map((scenario) => ({
		id: scenario.id,
		replacement: TRANSCRIPT_REPLACEMENTS[scenario.id],
		steps: scenario.steps.map((step) => ({
			id: `${scenario.id}#${step.id}`,
			replacement: `${TRANSCRIPT_REPLACEMENTS[scenario.id]}#${step.id}`,
		})),
	}));
	return {
		protocol: {
			preserved: PROTOCOL_PRESERVED_CASES,
			retired: [
				{
					id: "protocol.incoming.semantic-unknown-method",
					replacements: ["protocol.incoming.semantic-unknown-member"],
				},
			],
		},
		adapterGrandfathered: ADAPTER_GRANDFATHERED_CASES.map((id) => ({
			id,
			legacyFormat: true,
		})),
		raw: {
			preserved: rawIds.filter((id) => !retiredRawIds.has(id)),
			retired: Object.entries(RAW_REPLACEMENTS).map(([id, replacements]) => ({
				id,
				replacements,
			})),
		},
		transcript: { retired: transcriptScenarios },
		kat: { preserved: KAT_PRESERVED_CASES },
	};
}

export function buildRegistries({
	specificationBytes,
	supportManifest,
	baselineSpecificationBytes,
	legacyVerdicts,
	executionResults,
}) {
	const retiredIds = Object.keys(RETIRED_REQUIREMENT_REPLACEMENTS);
	const blocks = parseSpecificationBlocks(specificationBytes, retiredIds);
	const preservedIds = supportManifest.entries.map((entry) => entry.id);
	const newIds = expandNewRequirementIds();
	const activeIds = [...preservedIds, ...newIds];
	const diagnostics = [];

	if (supportManifest.entryCount !== 153 || preservedIds.length !== 153) {
		diagnostics.push("Preserved Requirement manifest must contain exactly 153 entries");
	}
	if (retiredIds.length !== 48) {
		diagnostics.push("Retired Requirement ledger must contain exactly 48 entries");
	}
	if (newIds.length !== 190) {
		diagnostics.push("New Requirement authority must contain exactly 190 entries");
	}
	for (const duplicate of duplicateValues(activeIds)) {
		diagnostics.push(`Duplicate active Requirement authority: ${duplicate}`);
	}
	for (const id of activeIds) {
		if (!requirementPattern.test(id)) {
			diagnostics.push(`Malformed active Requirement authority: ${id}`);
		}
		if (!blocks.has(id)) {
			diagnostics.push(`Missing normative Requirement block: ${id}`);
		}
	}
	for (const id of blocks.keys()) {
		if (!activeIds.includes(id)) {
			diagnostics.push(`Unknown normative Requirement block: ${id}`);
		}
	}
	for (const entry of supportManifest.entries) {
		const block = blocks.get(entry.id);
		if (block !== undefined && block.propositionSha256 !== entry.expectedFinalPayloadSha256) {
			diagnostics.push(`Preserved Requirement proposition drift: ${entry.id}`);
		}
	}
	if (diagnostics.length > 0) {
		throw new Error(diagnostics.join("\n"));
	}

	const baselinePropositions = parseBaselinePropositions(
		baselineSpecificationBytes,
	);
	const active = activeIds.map((id) => {
		const block = blocks.get(id);
		const profile = getVerificationProfile(id, new Set(preservedIds));
		return {
			id,
			status: "active",
			proposition: block.proposition,
			propositionSha256: block.propositionSha256,
			specificationCaseId: `specification.${id.toLowerCase()}`,
			verificationCaseId: `${profile.prefix}.requirement.${caseSlug(id)}`,
		};
	});
	const retired = retiredIds.map((id) => {
		const proposition = baselinePropositions.get(id);
		if (proposition === undefined) {
			throw new Error(`Baseline proposition is missing for retired Requirement: ${id}`);
		}
		return {
			id,
			status: "retired",
			lastProposition: proposition,
			lastPropositionSha256: sha256(proposition),
			reason: "Superseded by the immutable Ticket 14 retirement adjudication.",
			replacements: RETIRED_REQUIREMENT_REPLACEMENTS[id],
		};
	});

	const specificationDigest = sha256(specificationBytes);
	const runnerDigest = sha256(readFileSync(fileURLToPath(import.meta.url)));
	const canonical = [];
	const evidence = [];
	const matrix = [];
	const executionById = new Map(
		(executionResults?.commands ?? []).map((command) => [command.id, command]),
	);
	const executionCases = new Map();
	for (const requirement of active) {
		const specCase = {
			id: requirement.specificationCaseId,
			classification: "canonical",
			covers: [requirement.id],
			publicSeam: "normative SPECIFICATION requirement block",
			input: {
				requirementId: requirement.id,
				propositionSha256: requirement.propositionSha256,
			},
			expected: "The close-delimited raw proposition exactly matches the immutable registry.",
			failureOwner: "release-evidence",
			evidence: [`specification:${requirement.id}`],
			status: "verified",
		};
		const profile = getVerificationProfile(requirement.id, new Set(preservedIds));
		const installedPackageRequirement =
			requirement.id.startsWith("RPC-PKG-") ||
			requirement.id.startsWith("RPC-MIGRATION-") ||
			/^RPC-RELEASE-(?:007|008|010|013|014|015|016|017|018|021)$/u.test(
				requirement.id,
			);
		const executionId =
			requirement.id === "RPC-RELEASE-009"
				? "browser"
				: profile.prefix === "raw"
					? "corpus"
					: installedPackageRequirement ||
						(profile.prefix !== "package" && profile.prefix !== "doc")
						? "installed-node"
						: "pack";
		const execution = executionById.get(executionId);
		const executionSelector = `result:${executionId}`;
		const verified =
			executionResults?.artifactSha256 !== undefined &&
			execution?.status === "passed";
		const verifyCase = {
			id: requirement.verificationCaseId,
			classification: "canonical",
			covers: [requirement.id],
			publicSeam: `${profile.prefix} production verification seam`,
			input: { requirementId: requirement.id },
			expected: requirement.proposition,
			failureOwner: profile.owner,
			evidence: verified ? [executionSelector] : [],
			status: verified ? "verified" : "planned",
		};
		canonical.push(specCase, verifyCase);
		evidence.push({
			selector: `specification:${requirement.id}`,
			class: "specification",
			cases: [specCase.id],
			input: {
				requirementId: requirement.id,
				propositionSha256: requirement.propositionSha256,
			},
			expected: specCase.expected,
			artifactDigest: specificationDigest,
			runnerDigest,
			status: "verified",
		});
		if (verified) {
			const cases = executionCases.get(executionId) ?? [];
			cases.push(verifyCase.id);
			executionCases.set(executionId, cases);
		}
		matrix.push({
			requirementId: requirement.id,
			cases: [specCase.id, verifyCase.id],
		});
	}
	for (const [executionId, cases] of executionCases) {
		const execution = executionById.get(executionId);
		evidence.push({
			selector: `result:${executionId}`,
			class: executionId,
			cases,
			input: { artifactSha256: executionResults.artifactSha256 },
			expected: `The ${executionId} command completed against the authoritative artifact.`,
			artifactDigest: executionResults.artifactSha256,
			runnerDigest: execution.outputSha256 ?? runnerDigest,
			status: "verified",
		});
	}

	const retiredCases = [
		...legacyVerdicts.protocol.retired,
		...legacyVerdicts.raw.retired,
		...legacyVerdicts.transcript.retired.flatMap((scenario) => [
			{ id: scenario.id, replacements: [scenario.replacement] },
			...scenario.steps.map((step) => ({
				id: step.id,
				replacements: [step.replacement],
			})),
		]),
	].map((entry) => ({ ...entry, classification: "retired", status: "retired" }));

	return {
		requirements: {
			schemaVersion: 1,
			baseline: {
				commit: supportManifest.baselineCommit,
				tree: supportManifest.baselineTree,
				specificationSha256: supportManifest.baselineSpecificationSha256,
			},
			active,
			retired,
		},
		cases: {
			schemaVersion: 1,
			canonical,
			supportOnly: [],
			retired: retiredCases,
			legacyVerdicts,
		},
		matrix: { schemaVersion: 1, rows: matrix },
		evidence: { schemaVersion: 1, nodes: evidence },
	};
}

export function generateRegistries({
	inputSpecificationPath = specificationPath,
	inputSupportManifestPath = supportManifestPath,
	inputExecutionResultsPath = executionResultsPath,
	outputDirectory = evidenceRoot,
} = {}) {
	const supportManifestBytes = readFileSync(inputSupportManifestPath);
	if (sha256(supportManifestBytes) !== supportManifestSha256) {
		throw new Error("Preserved Requirement support manifest digest does not match authority");
	}
	const supportManifest = JSON.parse(supportManifestBytes.toString("utf8"));
	const specificationBytes = readFileSync(inputSpecificationPath);
	const baselineSpecificationBytes = readBaselineFile(
		supportManifest.baselineCommit,
		supportManifest.baselinePath,
	);
	if (sha256(baselineSpecificationBytes) !== supportManifest.baselineSpecificationSha256) {
		throw new Error("Baseline SPECIFICATION.md digest does not match authority");
	}
	const registries = buildRegistries({
		specificationBytes,
		supportManifest,
		baselineSpecificationBytes,
		legacyVerdicts: buildLegacyVerdicts(supportManifest.baselineCommit),
		executionResults: existsSync(inputExecutionResultsPath)
			? JSON.parse(readFileSync(inputExecutionResultsPath, "utf8"))
			: undefined,
	});

	// All validation above is intentionally complete before the first output byte.
	mkdirSync(outputDirectory, { recursive: true });
	for (const [name, value] of Object.entries(registries)) {
		writeFileSync(resolve(outputDirectory, `${name}.json`), json(value));
	}
	return registries;
}

function readRegistries() {
	return Object.fromEntries(
		["requirements", "cases", "matrix", "evidence"].map((name) => [
			name,
			JSON.parse(readFileSync(resolve(evidenceRoot, `${name}.json`), "utf8")),
		]),
	);
}

function assertDuplicateFree(values, label, diagnostics) {
	for (const duplicate of duplicateValues(values)) {
		diagnostics.push(`${label} repeats ${duplicate}`);
	}
}

export function auditLedger(
	registries,
	{ active = 343, legacyPreserve = 153, legacyRetire = 48 } = {},
) {
	const diagnostics = [];
	const activeIds = registries.requirements.active.map((entry) => entry.id);
	const retiredIds = registries.requirements.retired.map((entry) => entry.id);
	assertDuplicateFree(activeIds, "active Requirement ledger", diagnostics);
	assertDuplicateFree(retiredIds, "retired Requirement ledger", diagnostics);
	if (activeIds.length !== active) {
		diagnostics.push(`active Requirement count is ${activeIds.length}, expected ${active}`);
	}
	if (retiredIds.length !== legacyRetire) {
		diagnostics.push(`retired Requirement count is ${retiredIds.length}, expected ${legacyRetire}`);
	}
	const preservedCount = registries.requirements.active.filter((entry) =>
		entry.verificationCaseId.startsWith("runtime.legacy."),
	).length;
	if (preservedCount !== legacyPreserve) {
		diagnostics.push(`preserved Requirement count is ${preservedCount}, expected ${legacyPreserve}`);
	}
	for (const id of activeIds) {
		if (retiredIds.includes(id)) {
			diagnostics.push(`Requirement is both active and retired: ${id}`);
		}
	}
	for (const entry of registries.requirements.retired) {
		assertDuplicateFree(entry.replacements, `${entry.id} replacements`, diagnostics);
		for (const replacement of entry.replacements) {
			if (!activeIds.includes(replacement)) {
				diagnostics.push(`${entry.id} has unknown replacement ${replacement}`);
			}
		}
	}
	const verdicts = registries.cases.legacyVerdicts;
	if (verdicts.protocol.preserved.length !== 14) diagnostics.push("Protocol preserve count is not 14");
	if (verdicts.adapterGrandfathered.length !== 24) diagnostics.push("Adapter grandfather count is not 24");
	if (verdicts.raw.preserved.length !== 44) diagnostics.push("Raw preserve count is not 44");
	if (verdicts.raw.retired.length !== 8) diagnostics.push("Raw retire count is not 8");
	if (verdicts.transcript.retired.length !== 14) diagnostics.push("Transcript scenario retire count is not 14");
	const retiredSteps = verdicts.transcript.retired.flatMap((scenario) => scenario.steps);
	if (retiredSteps.length !== 42) diagnostics.push("Transcript step retire count is not 42");
	if (verdicts.kat.preserved.length !== 5) diagnostics.push("KAT preserve count is not 5");
	return diagnostics;
}

function auditSpecificationAgainstLedger(registries) {
	const diagnostics = [];
	if (sha256(readFileSync(supportManifestPath)) !== supportManifestSha256) {
		diagnostics.push("Preserved Requirement support manifest digest does not match authority");
	}
	const retiredIds = registries.requirements.retired.map((entry) => entry.id);
	let blocks;
	try {
		blocks = parseSpecificationBlocks(readFileSync(specificationPath), retiredIds);
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
	}
	const activeById = new Map(
		registries.requirements.active.map((entry) => [entry.id, entry]),
	);
	for (const [id, entry] of activeById) {
		const block = blocks.get(id);
		if (block === undefined) {
			diagnostics.push(`Missing normative Requirement block: ${id}`);
		} else if (
			block.propositionSha256 !== entry.propositionSha256 ||
			block.proposition !== entry.proposition
		) {
			diagnostics.push(`Registry proposition does not match normative bytes: ${id}`);
		}
	}
	for (const id of blocks.keys()) {
		if (!activeById.has(id)) diagnostics.push(`Normative block is not active: ${id}`);
	}
	return diagnostics;
}

export function auditGraph(registries, { zeroIncomplete = false } = {}) {
	const diagnostics = [];
	const activeIds = new Set(registries.requirements.active.map((entry) => entry.id));
	const retiredRequirementIds = new Set(
		registries.requirements.retired.map((entry) => entry.id),
	);
	const canonicalIds = registries.cases.canonical.map((entry) => entry.id);
	const supportIds = registries.cases.supportOnly.map((entry) => entry.id);
	const retiredCaseIds = registries.cases.retired.map((entry) => entry.id);
	const evidenceSelectors = registries.evidence.nodes.map(
		(entry) => entry.selector,
	);
	const matrixRequirementIds = registries.matrix.rows.map(
		(entry) => entry.requirementId,
	);
	const canonicalById = new Map(
		registries.cases.canonical.map((entry) => [entry.id, entry]),
	);
	const supportById = new Map(
		registries.cases.supportOnly.map((entry) => [entry.id, entry]),
	);
	const retiredCaseById = new Map(
		registries.cases.retired.map((entry) => [entry.id, entry]),
	);
	const evidenceBySelector = new Map(
		registries.evidence.nodes.map((entry) => [entry.selector, entry]),
	);
	const matrixByRequirement = new Map(
		registries.matrix.rows.map((entry) => [entry.requirementId, entry]),
	);

	assertDuplicateFree(canonicalIds, "canonical Case ledger", diagnostics);
	assertDuplicateFree(supportIds, "support-only Case ledger", diagnostics);
	assertDuplicateFree(retiredCaseIds, "retired Case ledger", diagnostics);
	assertDuplicateFree(evidenceSelectors, "Evidence selector ledger", diagnostics);
	assertDuplicateFree(matrixRequirementIds, "Requirement matrix", diagnostics);

	for (const id of canonicalById.keys()) {
		if (supportById.has(id) || retiredCaseById.has(id)) {
			diagnostics.push(`Case resolves to multiple classes: ${id}`);
		}
	}
	for (const id of supportById.keys()) {
		if (retiredCaseById.has(id)) {
			diagnostics.push(`Case resolves to multiple classes: ${id}`);
		}
	}
	for (const [requirementId, row] of matrixByRequirement) {
		if (!activeIds.has(requirementId)) {
			diagnostics.push(`Matrix row has unknown Requirement: ${requirementId}`);
		}
		assertDuplicateFree(row.cases, `${requirementId} matrix cases`, diagnostics);
		for (const caseId of row.cases) {
			const item = canonicalById.get(caseId);
			if (item === undefined) {
				diagnostics.push(`${requirementId} matrix references unknown canonical Case ${caseId}`);
			} else if (!item.covers.includes(requirementId)) {
				diagnostics.push(`${caseId} does not inversely cover ${requirementId}`);
			}
		}
	}
	for (const id of activeIds) {
		if (!matrixByRequirement.has(id)) diagnostics.push(`Active Requirement has no matrix row: ${id}`);
	}
	for (const item of canonicalById.values()) {
		assertDuplicateFree(item.covers, `${item.id} covers`, diagnostics);
		assertDuplicateFree(item.evidence, `${item.id} evidence`, diagnostics);
		if (item.covers.length === 0) diagnostics.push(`Canonical Case covers no Requirement: ${item.id}`);
		for (const requirementId of item.covers) {
			if (!activeIds.has(requirementId) || retiredRequirementIds.has(requirementId)) {
				diagnostics.push(`${item.id} covers non-active Requirement ${requirementId}`);
			}
			if (!matrixByRequirement.get(requirementId)?.cases.includes(item.id)) {
				diagnostics.push(`${item.id} cover is absent from matrix row ${requirementId}`);
			}
		}
		for (const selector of item.evidence) {
			const node = evidenceBySelector.get(selector);
			if (node === undefined) diagnostics.push(`${item.id} references unknown Evidence ${selector}`);
			else if (!node.cases.includes(item.id)) diagnostics.push(`${selector} omits inverse Case ${item.id}`);
		}
	}
	for (const node of evidenceBySelector.values()) {
		assertDuplicateFree(node.cases, `${node.selector} cases`, diagnostics);
		if (node.cases.length === 0) diagnostics.push(`Evidence selector is orphaned: ${node.selector}`);
		for (const caseId of node.cases) {
			const item = canonicalById.get(caseId);
			if (item === undefined) diagnostics.push(`${node.selector} references unknown canonical Case ${caseId}`);
			else if (!item.evidence.includes(node.selector)) diagnostics.push(`${node.selector} edge is absent from ${caseId}`);
		}
	}
	for (const item of supportById.values()) {
		assertDuplicateFree(item.supports, `${item.id} supports`, diagnostics);
		if (item.covers.length !== 0 || item.evidence.length !== 0 || item.supports.length === 0) {
			diagnostics.push(`Support-only Case has invalid graph shape: ${item.id}`);
		}
		for (const caseId of item.supports) {
			if (!canonicalById.has(caseId)) diagnostics.push(`${item.id} supports unknown Case ${caseId}`);
		}
	}
	if (zeroIncomplete) {
		for (const item of canonicalById.values()) {
			if (item.status !== "verified") diagnostics.push(`${item.id}: status=${item.status}`);
		}
		for (const node of evidenceBySelector.values()) {
			if (node.status !== "verified") diagnostics.push(`${node.selector}: status=${node.status}`);
		}
	}
	return diagnostics;
}

function parseExpectedCount(argv, name, fallback) {
	const index = argv.indexOf(name);
	return index === -1 ? fallback : Number(argv[index + 1]);
}

function runAudit(command, argv) {
	const registries = readRegistries();
	const zeroIncomplete = argv.includes("--zero-incomplete");
	const diagnostics =
		command === "ledger"
			? [
					...auditLedger(registries, {
					active: parseExpectedCount(argv, "--active", 343),
					legacyPreserve: parseExpectedCount(argv, "--legacy-preserve", 153),
					legacyRetire: parseExpectedCount(argv, "--legacy-retire", 48),
					}),
					...auditSpecificationAgainstLedger(registries),
					...(zeroIncomplete
						? auditGraph(registries, { zeroIncomplete: true })
						: []),
				]
			: auditGraph(registries, { zeroIncomplete });
	if (diagnostics.length > 0) {
		process.stderr.write(`${diagnostics.join("\n")}\n`);
		process.exitCode = 1;
		return;
	}
	process.stdout.write(
		`${command} audit passed: active=343 retired=48 canonical=${registries.cases.canonical.length} evidence=${registries.evidence.nodes.length}\n`,
	);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [command = "", ...argv] = process.argv.slice(2);
	if (command === "generate") {
		generateRegistries();
		process.stdout.write(`Generated immutable evidence registries in ${evidenceRoot}\n`);
	} else if (command === "ledger" || command === "graph") {
		runAudit(command, argv);
	} else {
		process.stderr.write("Usage: evidence-registry.mjs generate|ledger|graph [options]\n");
		process.exitCode = 2;
	}
}
