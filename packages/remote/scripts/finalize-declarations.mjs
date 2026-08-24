/**
 * @overview Makes emitted bundleless declarations resolvable by strict NodeNext consumers.
 * @author AEPKILL
 * @created 2026-08-25 03:24:00
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(
	process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);
const declarationRoot = resolve(packageRoot, "dist");
const relativeSpecifierPattern = /(from\s+["']|import\(["'])(\.\.?\/[^"']+)(["'])/gu;
const directorySpecifierPattern = /(from\s+["']|import\(["'])(\.\.?)(["'])/gu;

function declarationPaths(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return declarationPaths(path);
		return entry.name.endsWith(".d.ts") ? [path] : [];
	});
}

for (const path of declarationPaths(declarationRoot)) {
	const source = readFileSync(path, "utf8");
	const finalized = source
		.replace(
			relativeSpecifierPattern,
			(_match, prefix, specifier, quote) =>
				/\.(?:c|m)?js$/u.test(specifier)
					? `${prefix}${specifier}${quote}`
					: `${prefix}${specifier}.js${quote}`,
		)
		.replace(
			directorySpecifierPattern,
			(_match, prefix, specifier, quote) =>
				`${prefix}${specifier}/index.js${quote}`,
		);
	if (finalized !== source) writeFileSync(path, finalized);
}
