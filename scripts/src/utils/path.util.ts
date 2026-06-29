/**
 * Path utilities for code standard validation.
 *
 * @overview
 * Provides shared utilities for parsing and validating file paths.
 * Uses Node.js path module for cross-platform compatibility.
 *
 * @author AEPKILL
 * @created 2026-03-31 16:45:00
 */

import { posix } from "node:path";

export function extractFileName(filePath: string): string {
	return posix.basename(filePath);
}

export function getPathSegments(filePath: string): string[] {
	const normalizedPath = posix.normalize(filePath);
	return normalizedPath.split(posix.sep).filter(Boolean);
}
