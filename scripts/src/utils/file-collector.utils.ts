/**
 * File collector utility for code standard validation.
 *
 * @overview
 * Collects TypeScript files that are in scope for code standard validation.
 * Handles directory traversal and file filtering based on repository rules.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ignoredDirectoryNames = new Set([
	".agents",
	".git",
	"coverage",
	"dist",
	"docs",
	"node_modules",
]);

export function collectInScopeFiles(rootDirectoryPath: string): string[] {
	const filePaths: string[] = [];

	const packagesDirectoryPath = join(rootDirectoryPath, "packages");
	if (existsSync(packagesDirectoryPath)) {
		filePaths.push(...collectDirectoryFiles(packagesDirectoryPath));
	}

	const scriptsDirectoryPath = join(rootDirectoryPath, "scripts");
	if (existsSync(scriptsDirectoryPath)) {
		filePaths.push(...collectDirectoryFiles(scriptsDirectoryPath));
	}

	return filePaths
		.filter((filePath) => isInScopeFile(rootDirectoryPath, filePath))
		.sort((left, right) => left.localeCompare(right));
}

export function collectDirectoryFiles(directoryPath: string): string[] {
	const filePaths: string[] = [];

	for (const directoryEntry of readdirSync(directoryPath)) {
		if (ignoredDirectoryNames.has(directoryEntry)) {
			continue;
		}

		const entryPath = join(directoryPath, directoryEntry);
		if (statSync(entryPath).isDirectory()) {
			filePaths.push(...collectDirectoryFiles(entryPath));
			continue;
		}

		filePaths.push(entryPath);
	}

	return filePaths;
}

export function isInScopeFile(
	rootDirectoryPath: string,
	filePath: string,
): boolean {
	const relativeFilePath = toPortablePath(
		relative(rootDirectoryPath, filePath),
	);

	if (!relativeFilePath.endsWith(".ts")) {
		return false;
	}

	const pathSegments = relativeFilePath.split("/");
	if (pathSegments[0] === "scripts") {
		return true;
	}

	if (pathSegments[0] !== "packages" || pathSegments.length < 4) {
		return false;
	}

	return pathSegments[2] === "src" || pathSegments[2] === "tests";
}

function toPortablePath(filePath: string): string {
	return filePath.split(sep).join("/");
}
