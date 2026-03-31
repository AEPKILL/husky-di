/**
 * Code standard check CLI entry point.
 *
 * @overview
 * Command-line interface for running repository code standard validation.
 * Executes the validator and outputs diagnostics or success message.
 *
 * @author AEPKILL
 * @created 2026-03-29 21:35:00
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateCodeStandard } from "./utils/validate-code-standard.utils";

function findProjectRoot(startPath: string): string {
	let currentPath = startPath;

	while (true) {
		if (existsSync(join(currentPath, ".git"))) {
			return currentPath;
		}

		const parentPath = dirname(currentPath);
		if (parentPath === currentPath) {
			throw new Error("Could not find project root (no .git directory found).");
		}
		currentPath = parentPath;
	}
}

function runCli(): number {
	const __filename = fileURLToPath(import.meta.url);
	const projectRootPath = findProjectRoot(dirname(__filename));
	const diagnostics = validateCodeStandard(projectRootPath);
	if (diagnostics.length === 0) {
		console.log("Code standard check passed.");
		return 0;
	}

	for (const diagnostic of diagnostics) {
		console.error(
			`[${diagnostic.ruleId}] ${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
		);
	}

	return 1;
}

const entryFilePath = process.argv[1];
if (entryFilePath && import.meta.url === pathToFileURL(entryFilePath).href) {
	process.exit(runCli());
}
