/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 *
 */
export default {
	"*.{js,ts,jsx,tsx}": ["biome check --write --no-errors-on-unmatched"],
	"*.json": ["biome check --write --no-errors-on-unmatched"],
	"*.{css,scss,sass,less}": ["biome check --write --no-errors-on-unmatched"],
};
