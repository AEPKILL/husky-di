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
import { join, sep } from "node:path";
import { DEFAULT_CONFIG } from "@/config/code-standard.config";
import type { CodeStandardConfig } from "@/types/config.type";

export function collectInScopeFiles(
	rootDirectoryPath: string,
	config: CodeStandardConfig = DEFAULT_CONFIG,
): string[] {
	const filePaths: string[] = [];

	for (const packageRootName of config.packageRootNames) {
		const packageDirectoryPath = join(rootDirectoryPath, packageRootName);
		if (existsSync(packageDirectoryPath)) {
			filePaths.push(...collectDirectoryFiles(packageDirectoryPath, config));
		}
	}

	return filePaths
		.filter((filePath) => isInScopeFile(rootDirectoryPath, filePath, config))
		.sort((left, right) => left.localeCompare(right));
}

export function collectDirectoryFiles(
	directoryPath: string,
	config: CodeStandardConfig = DEFAULT_CONFIG,
): string[] {
	const filePaths: string[] = [];

	for (const directoryEntry of readdirSync(directoryPath)) {
		if (config.ignoredDirectoryNames.includes(directoryEntry)) {
			continue;
		}

		const entryPath = join(directoryPath, directoryEntry);
		if (statSync(entryPath).isDirectory()) {
			filePaths.push(...collectDirectoryFiles(entryPath, config));
			continue;
		}

		filePaths.push(entryPath);
	}

	return filePaths;
}

export function isInScopeFile(
	rootDirectoryPath: string,
	filePath: string,
	config: CodeStandardConfig = DEFAULT_CONFIG,
): boolean {
	const relativeFilePath = toPortablePath(
		filePath.slice(rootDirectoryPath.length + 1),
	);

	if (!relativeFilePath.endsWith(".ts")) {
		return false;
	}

	const pathSegments = relativeFilePath.split("/");

	for (const packageRootName of config.packageRootNames) {
		if (pathSegments[0] !== packageRootName) {
			continue;
		}

		const sourceIndex = findFirstSegmentIndex(
			pathSegments,
			config.sourceDirectories,
		);

		if (sourceIndex === -1) {
			return false;
		}

		const nextSegment = pathSegments[sourceIndex + 1];
		if (!nextSegment) {
			return false;
		}

		if (nextSegment.endsWith(".ts")) {
			return true;
		}

		return (
			config.sourceDirectories.includes(nextSegment) ||
			config.sourceDirectoryNames.includes(nextSegment)
		);
	}

	return false;
}

function findFirstSegmentIndex(
	pathSegments: string[],
	targetDirectories: readonly string[],
): number {
	for (const targetName of targetDirectories) {
		const index = pathSegments.indexOf(targetName);
		if (index !== -1) {
			return index;
		}
	}
	return -1;
}

function toPortablePath(filePath: string): string {
	return filePath.split(sep).join("/");
}
