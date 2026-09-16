/**
 * @overview Shared lint-staged configuration for workspace packages.
 * @author AEPKILL
 * @created 2026-05-10 12:30:15 22:15:00
 */

import type { Configuration } from "lint-staged";

export default createLintStagedConfiguration();

function createLintStagedConfiguration(): Configuration {
	return {
		"*.{js,ts,jsx,tsx}": ["biome check --write --no-errors-on-unmatched"],
		"*.json": ["biome check --write --no-errors-on-unmatched"],
		"*.{css,scss,sass,less}": ["biome check --write --no-errors-on-unmatched"],
	};
}
