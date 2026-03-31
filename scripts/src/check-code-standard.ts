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

import process from "node:process";
import { pathToFileURL } from "node:url";
import { validateCodeStandard } from "./utils/validate-code-standard.utils.js";

function runCli(): number {
	const diagnostics = validateCodeStandard(process.cwd());
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
