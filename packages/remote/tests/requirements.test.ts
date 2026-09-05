/**
 * @overview Release-gate validation for the Remote RPC requirement matrix.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type RequirementRow = {
	readonly id: string;
	readonly kinds: readonly string[];
	readonly references: readonly string[];
	readonly status: string;
};

const repositoryRoot = resolve(
	fileURLToPath(new URL("../../../", import.meta.url)),
);
const specificationPath = resolve(
	repositoryRoot,
	"packages/remote/docs/SPECIFICATION.md",
);
const matrixPath = resolve(
	repositoryRoot,
	"packages/remote/docs/REQUIREMENTS.md",
);
const normativeRuntimePath = resolve(
	repositoryRoot,
	"packages/remote/tests/specification.test.ts",
);
const protocolGrammarPath = resolve(
	repositoryRoot,
	"packages/remote/src/utils/protocol/rpc-wire-grammar.util.ts",
);
const protocolRecordTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/types/protocol/rpc-wire-record.type.ts",
);
const rpcTypeGuardPath = resolve(
	repositoryRoot,
	"packages/remote/src/utils/type-guard.util.ts",
);
const conformanceTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/conformance/rpc-conformance.type.ts",
);
const callerTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/types/common/rpc-caller.type.ts",
);
const descriptorTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/types/peer/remote-service-descriptor.type.ts",
);
const runtimePolicyTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/types/protocol/rpc-runtime-policy.type.ts",
);
const reconnectionTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/types/reconnection/rpc-connector-reconnection.type.ts",
);
const canonicalIdPattern = /^RPC-[A-Z]+-[0-9]{3}$/;
const allowedEvidenceKinds = new Set([
	"RT",
	"TY",
	"RP",
	"PC",
	"AC",
	"PK",
	"BR",
	"IR",
]);

function getSpecificationIds(source: string): readonly string[] {
	return [...source.matchAll(/^\*\*(RPC-[A-Z]+-[0-9]{3})\s+—/gmu)].map(
		([, id]) => id as string,
	);
}

function getRequirementRows(source: string): readonly RequirementRow[] {
	return source
		.split("\n")
		.filter((line) => /^\| `RPC-[A-Z]+-[0-9]{3}` \|/u.test(line))
		.map((line) => {
			const [, idCell, , kindsCell, referencesCell, statusCell] = line
				.split("|")
				.map((cell) => cell.trim());
			return {
				id: (idCell as string).slice(1, -1),
				kinds:
					kindsCell === "—"
						? []
						: (kindsCell as string).split(",").map((kind) => kind.trim()),
				references:
					referencesCell === "—"
						? []
						: (referencesCell as string)
								.split("<br>")
								.map((reference) => reference.trim().replace(/^`|`$/gu, "")),
				status: statusCell as string,
			};
		});
}

function getNormativeTestTitles(source: string): readonly string[] {
	return [
		...source.matchAll(/\bit(?:\.each\([\s\S]*?\))?\(\s*"([^"]+)"/gu),
	].map(([, title]) => title as string);
}

function validateReference(
	requirementId: string,
	reference: string,
	diagnostics: string[],
): string | undefined {
	const match = /^(RT|TY|RP|PC|AC|PK|BR|IR)::([^:]+)::(.+)$/u.exec(reference);
	if (match === null) {
		diagnostics.push(
			`${requirementId}: malformed evidence reference ${JSON.stringify(reference)}`,
		);
		return undefined;
	}
	const [, kind, repositoryPath, selector] = match as unknown as readonly [
		string,
		string,
		string,
		string,
	];
	const evidencePath = resolve(repositoryRoot, repositoryPath);
	if (!evidencePath.startsWith(`${repositoryRoot}${sep}`)) {
		diagnostics.push(`${requirementId}: evidence escapes the repository`);
		return kind;
	}
	try {
		if (!statSync(evidencePath).isFile()) {
			diagnostics.push(
				`${requirementId}: evidence is not a file: ${repositoryPath}`,
			);
			return kind;
		}
	} catch {
		diagnostics.push(
			`${requirementId}: evidence file is missing: ${repositoryPath}`,
		);
		return kind;
	}

	const source = readFileSync(evidencePath, "utf8");
	if (!selector.includes(requirementId)) {
		diagnostics.push(
			`${requirementId}: text selector omits the full canonical ID: ${selector}`,
		);
	}
	if (!source.includes(selector)) {
		diagnostics.push(
			`${requirementId}: text selector does not resolve: ${repositoryPath}#${selector}`,
		);
	}
	return kind;
}

describe("Remote RPC requirement evidence", () => {
	it("RPC-PKG-004 colocates private schemas with derived configuration types and uses native primitive guards", () => {
		const specificationSource = readFileSync(specificationPath, "utf8");
		const grammarSource = readFileSync(protocolGrammarPath, "utf8");
		const recordTypesSource = readFileSync(protocolRecordTypesPath, "utf8");
		const rpcTypeGuardSource = readFileSync(rpcTypeGuardPath, "utf8");
		const schemaTypeSources = [
			{
				source: readFileSync(conformanceTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RpcConformanceOptions",
						projection: "input",
						schemaName: "rpcConformanceOptionsSchema",
					},
					{
						typeName: "RpcConformanceOptionsSnapshot",
						projection: "output",
						schemaName: "rpcConformanceOptionsSchema",
					},
				],
			},
			{
				source: readFileSync(callerTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RpcConnectorOptions",
						projection: "input",
						schemaName: "rpcConnectorOptionsSchema",
					},
					{
						typeName: "RpcConnectorConnectOptions",
						projection: "input",
						schemaName: "rpcConnectorConnectOptionsSchema",
					},
					{
						typeName: "RpcConnectorConnectOptionsSnapshot",
						projection: "output",
						schemaName: "rpcConnectorConnectOptionsSchema",
					},
					{
						typeName: "RpcAcceptorOptions",
						projection: "input",
						schemaName: "rpcAcceptorOptionsSchema",
					},
				],
			},
			{
				source: readFileSync(descriptorTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RemoteServiceDescriptorOptions",
						projection: "input",
						schemaName: "remoteServiceDescriptorOptionsSchema",
					},
					{
						typeName: "RemoteServiceDescriptorOptionsSnapshot",
						projection: "output",
						schemaName: "remoteServiceDescriptorOptionsSchema",
					},
				],
			},
			{
				source: readFileSync(runtimePolicyTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RpcAcceptorRuntimePolicyOptions",
						projection: "input",
						schemaName: "rpcAcceptorRuntimePolicyOptionsSchema",
					},
					{
						typeName: "RpcConnectorRuntimePolicyOptions",
						projection: "input",
						schemaName: "rpcConnectorRuntimePolicyOptionsSchema",
					},
					{
						typeName: "RpcAcceptorRuntimePolicyOptionsSnapshot",
						projection: "output",
						schemaName: "rpcAcceptorRuntimePolicyOptionsSchema",
					},
					{
						typeName: "RpcConnectorRuntimePolicyOptionsSnapshot",
						projection: "output",
						schemaName: "rpcConnectorRuntimePolicyOptionsSchema",
					},
					{
						typeName: "RpcProtocolRuntimePolicy",
						projection: "output",
						schemaName: "rpcProtocolRuntimePolicySchema",
					},
				],
			},
			{
				source: readFileSync(reconnectionTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RpcConnectorAdapterFactory",
						projection: "output",
						schemaName: "rpcConnectorAdapterFactorySchema",
					},
					{
						typeName: "RpcConnectorReconnectionPolicyOptions",
						projection: "input",
						schemaName: "rpcConnectorReconnectionPolicySchema",
					},
					{
						typeName: "RpcConnectorReconnectionPolicy",
						projection: "output",
						schemaName: "rpcConnectorReconnectionPolicySchema",
					},
					{
						typeName: "CreateRpcConnectorReconnectionOptions",
						projection: "input",
						schemaName: "rpcConnectorReconnectionOptionsSchema",
					},
				],
			},
		] as const;
		const compactRecordTypesSource = recordTypesSource.replaceAll(/\s+/gu, "");
		const recordSchemaNames = [
			"rpcJsonRecordSchema",
			"rpcFreshRequestSchema",
			"rpcFreshAcceptSchema",
			"rpcResumeRequestSchema",
			"rpcBootstrapRequestSchema",
			"rpcResumeAcceptSchema",
			"rpcResumeRejectSchema",
			"rpcResumeOutcomeSchema",
			"rpcCallMessageSchema",
			"rpcCancelMessageSchema",
			"rpcResultMessageSchema",
			"rpcWireErrorCodeSchema",
			"rpcErrorMessageSchema",
			"rpcSemanticMessageSchema",
			"rpcMessageEnvelopeSchema",
			"rpcAckRecordSchema",
			"rpcControlRecordSchema",
			"rpcActiveRecordSchema",
		] as const;
		const runtimeSchemaOwnerPaths = [
			"packages/remote/src/impls/peer/rpc-peer-call-lifecycle.impl.ts",
			"packages/remote/src/utils/protocol/rpc-base64-url-32-schema.util.ts",
			"packages/remote/src/utils/protocol/rpc-wire-grammar.util.ts",
			"packages/remote/src/utils/protocol/rpc-wire-identifier-schema.util.ts",
		] as const;
		const schemaConsumerPaths = [
			"packages/remote/src/conformance/rpc-conformance.util.ts",
			"packages/remote/src/factories/remote-service-descriptor.factory.ts",
			"packages/remote/src/factories/rpc-acceptor.factory.ts",
			"packages/remote/src/factories/rpc-connector-reconnection.factory.ts",
			"packages/remote/src/factories/rpc-connector.factory.ts",
			"packages/remote/src/factories/rpc-owner-assembly.factory.ts",
			"packages/remote/src/impls/owner/rpc-connector.impl.ts",
		] as const;
		const nativeGuardOwnerPaths = [
			"packages/remote/src/conformance/rpc-protocol-conformance.util.ts",
			"packages/remote/src/impls/endpoint/rpc-endpoint.impl.ts",
			"packages/remote/src/impls/common/rpc-retained-bytes-ledger.impl.ts",
			"packages/remote/src/utils/rpc-exposure.util.ts",
		] as const;
		const callableGuardConsumerPaths = [
			"packages/remote/src/conformance/rpc-protocol-conformance.util.ts",
			"packages/remote/src/factories/rpc-acceptor.factory.ts",
			"packages/remote/src/factories/rpc-connector.factory.ts",
			"packages/remote/src/factories/rpc-owner-assembly.factory.ts",
			"packages/remote/src/impls/owner/rpc-acceptor.impl.ts",
			"packages/remote/src/impls/owner/rpc-session-ownership.impl.ts",
			"packages/remote/src/impls/peer/rpc-peer-call-lifecycle.impl.ts",
			"packages/remote/src/utils/rpc-exposure.util.ts",
		] as const;
		const nonNullObjectGuardConsumerPaths = [
			"packages/remote/src/conformance/rpc-protocol-conformance.util.ts",
			"packages/remote/src/factories/rpc-owner-assembly.factory.ts",
			"packages/remote/src/impls/owner/rpc-acceptor.impl.ts",
			"packages/remote/src/impls/owner/rpc-session-ownership.impl.ts",
			"packages/remote/src/impls/peer/rpc-peer-call-lifecycle.impl.ts",
		] as const;
		const undefinedGuardConsumerPaths = [
			"packages/remote/src/impls/owner/rpc-acceptor.impl.ts",
		] as const;

		expect(specificationSource).not.toMatch(/zod/iu);
		expect(grammarSource).toContain('from "zod"');
		expect(grammarSource).toContain("z.custom<number>(isPositiveSafeInteger)");
		expect(grammarSource).toContain("isNonNegativeSafeInteger");
		expect(rpcTypeGuardSource).toContain('return typeof value === "function";');
		expect(rpcTypeGuardSource).toContain(
			'return typeof value === "object" && value !== null;',
		);
		expect(rpcTypeGuardSource).toContain("return value === undefined;");
		for (const guardName of [
			"isArray",
			"isCallable",
			"isFiniteNumber",
			"isNonNegativeSafeInteger",
			"isNonNullObject",
			"isObjectOrFunction",
			"isPositiveSafeInteger",
			"isUndefined",
			"isUint8Array",
		] as const) {
			expect(rpcTypeGuardSource).toContain(`export function ${guardName}`);
		}
		for (const schemaName of recordSchemaNames) {
			expect(compactRecordTypesSource).toContain(
				`RpcSchemaOutput<typeof${schemaName}>`,
			);
		}
		const colocatedSchemaNames = new Set<string>();
		for (const { derivations, source } of schemaTypeSources) {
			expect(source).toContain('from "zod"');
			for (const { projection, schemaName, typeName } of derivations) {
				expect(source).toContain(`const ${schemaName}`);
				colocatedSchemaNames.add(schemaName);
				const declarationStart = new RegExp(
					`export type ${typeName}(?=[\\s<])`,
					"u",
				).exec(source)?.index;
				expect(declarationStart).toBeDefined();
				if (declarationStart === undefined) {
					continue;
				}
				expect(declarationStart).toBeGreaterThanOrEqual(0);
				const nextExport = source.indexOf("\nexport ", declarationStart + 1);
				const declarationSource = source.slice(
					declarationStart,
					nextExport < 0 ? undefined : nextExport,
				);
				expect(declarationSource.replaceAll(/\s+/gu, "")).toContain(
					`${projection}<typeof${schemaName}>`,
				);
			}
		}
		for (const ownerPath of runtimeSchemaOwnerPaths) {
			const ownerSource = readFileSync(
				resolve(repositoryRoot, ownerPath),
				"utf8",
			);
			expect(ownerSource).toContain('from "zod"');
		}
		for (const consumerPath of schemaConsumerPaths) {
			const consumerSource = readFileSync(
				resolve(repositoryRoot, consumerPath),
				"utf8",
			);
			expect(consumerSource).not.toMatch(/\bconst\s+\w+Schema\s*=/u);
			expect(consumerSource).not.toContain("readRpcClosedOptionsRecord");
			expect(consumerSource).not.toContain("validateRpcPositiveSafeInteger");
		}
		for (const ownerPath of nativeGuardOwnerPaths) {
			const ownerSource = readFileSync(
				resolve(repositoryRoot, ownerPath),
				"utf8",
			);
			expect(ownerSource).toContain("@/utils/type-guard.util");
			expect(ownerSource).not.toContain('from "zod"');
		}
		for (const consumerPath of callableGuardConsumerPaths) {
			const consumerSource = readFileSync(
				resolve(repositoryRoot, consumerPath),
				"utf8",
			);
			expect(consumerSource).toContain("isCallable");
			expect(consumerSource).not.toContain("z.function()");
		}
		for (const consumerPath of nonNullObjectGuardConsumerPaths) {
			expect(
				readFileSync(resolve(repositoryRoot, consumerPath), "utf8"),
			).toContain("isNonNullObject");
		}
		for (const consumerPath of undefinedGuardConsumerPaths) {
			expect(
				readFileSync(resolve(repositoryRoot, consumerPath), "utf8"),
			).toContain("isUndefined");
		}
		expect(
			existsSync(
				resolve(repositoryRoot, "packages/remote/src/utils/rpc-schema.util.ts"),
			),
		).toBe(false);
		expect(
			existsSync(
				resolve(
					repositoryRoot,
					"packages/remote/src/utils/rpc-runtime-policy.util.ts",
				),
			),
		).toBe(false);
		for (const publicEntry of [
			"index",
			"protocol",
			"transport",
			"conformance",
		]) {
			const publicSource = readFileSync(
				resolve(repositoryRoot, `packages/remote/src/${publicEntry}.ts`),
				"utf8",
			);
			expect(publicSource).not.toContain("type-guard");
			expect(publicSource).not.toContain("rpc-wire-grammar");
			expect(publicSource).not.toContain('from "zod"');
			for (const schemaName of colocatedSchemaNames) {
				expect(publicSource).not.toContain(schemaName);
			}
		}
	});

	it("RPC-EVIDENCE-003 keeps the normative runtime entry on canonical public seams", () => {
		const source = readFileSync(normativeRuntimePath, "utf8");
		const titles = getNormativeTestTitles(source);
		const testCallCount = [...source.matchAll(/\bit(?:\.each)?\(/gu)].length;
		const sourceImports = [...source.matchAll(/\bfrom\s+"([^"]+)"/gu)].map(
			([, specifier]) => specifier as string,
		);

		expect(titles).toHaveLength(testCallCount);
		expect(titles.length).toBeGreaterThan(0);
		expect(
			titles.filter((title) => !/\bRPC-[A-Z]+-[0-9]{3}\b/u.test(title)),
		).toEqual([]);
		expect(
			sourceImports.filter(
				(specifier) =>
					specifier.startsWith("../src/") &&
					!new Set([
						"../src/conformance",
						"../src/index",
						"../src/protocol",
						"../src/transport",
					]).has(specifier),
			),
		).toEqual([]);
	});

	it("RPC-EVIDENCE-001 RPC-EVIDENCE-002 closes one precise verified evidence row per normative requirement", () => {
		const specificationIds = getSpecificationIds(
			readFileSync(specificationPath, "utf8"),
		);
		const rows = getRequirementRows(readFileSync(matrixPath, "utf8"));
		const diagnostics: string[] = [];
		const specificationIdSet = new Set(specificationIds);
		const rowCounts = new Map<string, number>();

		for (const id of specificationIds) {
			if (!canonicalIdPattern.test(id)) {
				diagnostics.push(`Specification has a malformed requirement ID: ${id}`);
			}
		}
		if (specificationIdSet.size !== specificationIds.length) {
			diagnostics.push("Specification requirement IDs are not unique");
		}

		for (const row of rows) {
			rowCounts.set(row.id, (rowCounts.get(row.id) ?? 0) + 1);
			if (!specificationIdSet.has(row.id)) {
				diagnostics.push(`${row.id}: matrix row has no normative requirement`);
			}
			if (row.kinds.length === 0) {
				diagnostics.push(`${row.id}: has no evidence kind`);
			}
			if (new Set(row.kinds).size !== row.kinds.length) {
				diagnostics.push(`${row.id}: repeats an evidence kind`);
			}
			for (const kind of row.kinds) {
				if (!allowedEvidenceKinds.has(kind)) {
					diagnostics.push(`${row.id}: unsupported evidence kind ${kind}`);
				}
			}

			if (row.references.length === 0) {
				diagnostics.push(`${row.id}: has no concrete evidence reference`);
			}
			const resolvedKinds = row.references
				.map((reference) => validateReference(row.id, reference, diagnostics))
				.filter((kind): kind is string => kind !== undefined);
			if (
				row.kinds.some((kind) => !resolvedKinds.includes(kind)) ||
				resolvedKinds.some((kind) => !row.kinds.includes(kind))
			) {
				diagnostics.push(
					`${row.id}: declared evidence kinds do not match its references`,
				);
			}
			if (row.status !== "verified") {
				diagnostics.push(
					`${row.id}: status is ${row.status}, expected verified`,
				);
			}
		}

		for (const id of specificationIds) {
			if (rowCounts.get(id) !== 1) {
				diagnostics.push(
					`${id}: expected exactly one matrix row, found ${rowCounts.get(id) ?? 0}`,
				);
			}
		}

		expect(specificationIds).toHaveLength(200);
		expect(diagnostics).toEqual([]);
	});
});
