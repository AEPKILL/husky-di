/**
 * @filename: .lintstagedrc.js
 * @type {import('lint-staged').Configuration}
 *
 */
export default {
	"*.{js,ts,jsx,tsx}": ["biome check --write"],
	"*.json": ["biome check --write"],
	"*.{css,scss,sass,less}": ["biome check --write"],
};
