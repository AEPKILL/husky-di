/**
 * @overview Guards the Remote package's explicit concrete implementation DAG.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(packageRoot, "src");
const implementationRoot = resolve(sourceRoot, "impls");

const allowedImplementationEdges = new Map<string, ReadonlySet<string>>([
	[
		"src/impls/protocol/rpc-protocol-connector.impl.ts",
		new Set([
			"src/impls/common/rpc-retained-bytes-ledger.impl.ts",
			"src/impls/protocol/rpc-binding-attempt.impl.ts",
			"src/impls/session/rpc-session.impl.ts",
		]),
	],
	[
		"src/impls/protocol/rpc-protocol-acceptor.impl.ts",
		new Set([
			"src/impls/common/rpc-retained-bytes-ledger.impl.ts",
			"src/impls/protocol/rpc-binding-attempt.impl.ts",
			"src/impls/session/rpc-session.impl.ts",
		]),
	],
	[
		"src/impls/protocol/rpc-binding-attempt.impl.ts",
		new Set(["src/impls/endpoint/rpc-endpoint.impl.ts"]),
	],
]);

function listTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory()
			? listTypeScriptFiles(path)
			: entry.name.endsWith(".ts")
				? [path]
				: [];
	});
}

function listImportSpecifiers(source: string): string[] {
	return [
		...source.matchAll(/(?:\bfrom\s+|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/gu),
	].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

function resolveSourceImport(
	importer: string,
	specifier: string,
): string | undefined {
	const unresolved = specifier.startsWith("@/")
		? resolve(sourceRoot, specifier.slice(2))
		: specifier.startsWith(".")
			? resolve(dirname(importer), specifier)
			: undefined;
	if (unresolved === undefined) {
		return undefined;
	}
	return [unresolved, `${unresolved}.ts`, resolve(unresolved, "index.ts")].find(
		(path) => existsSync(path),
	);
}

function packagePath(path: string): string {
	return relative(packageRoot, path).split(sep).join("/");
}

function isImplementation(path: string): boolean {
	return (
		path === implementationRoot ||
		path.startsWith(`${implementationRoot}${sep}`)
	);
}

function isAllowedImplementationImport(
	importer: string,
	target: string,
): boolean {
	const from = packagePath(importer);
	const to = packagePath(target);
	return (
		from.startsWith("src/factories/") ||
		allowedImplementationEdges.get(from)?.has(to) === true
	);
}

describe("Remote package dependency direction", () => {
	it("allows concrete imports only from factories and the explicit Default Protocol DAG", () => {
		const violations = listTypeScriptFiles(sourceRoot).flatMap((importer) =>
			listImportSpecifiers(readFileSync(importer, "utf8")).flatMap(
				(specifier) => {
					const target = resolveSourceImport(importer, specifier);
					if (
						target === undefined ||
						!isImplementation(target) ||
						isAllowedImplementationImport(importer, target)
					) {
						return [];
					}
					return [`${packagePath(importer)} -> ${packagePath(target)}`];
				},
			),
		);

		expect(violations).toEqual([]);
	});
});
