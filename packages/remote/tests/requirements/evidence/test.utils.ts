/**
 * @overview Shared requirements fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(
	fileURLToPath(new URL("../../../../../", import.meta.url)),
);

export const specificationPath = resolve(
	repositoryRoot,
	"packages/remote/docs/SPECIFICATION.md",
);

export const matrixPath = resolve(
	repositoryRoot,
	"packages/remote/docs/REQUIREMENTS.md",
);

export const normativeRuntimePath = resolve(
	repositoryRoot,
	"packages/remote/tests/specification.test.ts",
);

export const protocolGrammarPath = resolve(
	repositoryRoot,
	"packages/remote/src/modules/protocol/utils/rpc-wire-grammar.util.ts",
);

export const protocolRecordTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/modules/protocol/types/rpc-wire-record.type.ts",
);

export const rpcTypeGuardPath = resolve(
	repositoryRoot,
	"packages/remote/src/shared/utils/type-guard.util.ts",
);

export const conformanceTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/conformance/rpc-conformance.type.ts",
);

export const callerTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/modules/owner/types/rpc-caller.type.ts",
);

export const descriptorTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/modules/peer/types/remote-service-descriptor.type.ts",
);

export const runtimePolicyTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/modules/protocol/types/rpc-runtime-policy.type.ts",
);

export const reconnectionTypesPath = resolve(
	repositoryRoot,
	"packages/remote/src/modules/reconnection/types/rpc-connector-reconnection.type.ts",
);

export const canonicalIdPattern = /^RPC-[A-Z]+-[0-9]{3}$/;

export const allowedEvidenceKinds = new Set([
	"RT",
	"TY",
	"RP",
	"PC",
	"AC",
	"PK",
	"BR",
	"IR",
]);

export function getSpecificationIds(source: string): readonly string[] {
	return [...source.matchAll(/^\*\*(RPC-[A-Z]+-[0-9]{3})\s+—/gmu)].map(
		([, id]) => id as string,
	);
}

export function getRequirementRows(source: string): readonly RequirementRow[] {
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

export function getNormativeTestTitles(source: string): readonly string[] {
	return [
		...source.matchAll(/\bit(?:\.each\([\s\S]*?\))?\(\s*"([^"]+)"/gu),
	].map(([, title]) => title as string);
}

export function validateReference(
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

type RequirementRow = {
	readonly id: string;
	readonly kinds: readonly string[];
	readonly references: readonly string[];
	readonly status: string;
};
