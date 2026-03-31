/**
 * File placement validator constants.
 *
 * @overview
 * Re-exports allowed source directory names and required file suffixes
 * from the default configuration for backward compatibility.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:27:40
 */

import { DEFAULT_CONFIG } from "@/config/code-standard.config";

export const ALLOWED_SOURCE_DIRECTORY_NAMES = new Set(
	DEFAULT_CONFIG.sourceDirectoryNames,
);

export const REQUIRED_SUFFIX_BY_SOURCE_DIRECTORY =
	DEFAULT_CONFIG.requiredSuffixBySourceDirectoryName;
