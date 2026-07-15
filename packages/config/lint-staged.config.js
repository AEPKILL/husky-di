/**
 * @overview Shared lint-staged configuration for workspace packages.
 * @author AEPKILL
 * @created 2026-07-15 22:15:00
 */

const lintStagedConfiguration = {
	"*.{js,ts,jsx,tsx}": ["biome check --write --no-errors-on-unmatched"],
	"*.json": ["biome check --write --no-errors-on-unmatched"],
	"*.{css,scss,sass,less}": ["biome check --write --no-errors-on-unmatched"],
};

export default lintStagedConfiguration;
