/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 *
 * 根目录的 lint-staged 配置
 * 仅处理根目录的文件，不包括 packages/ 目录下的文件
 * 每个 package 都有自己的配置文件
 */
export default {
	// 处理根目录的 TypeScript/JavaScript 文件
	"*.{js,ts,jsx,tsx}": ["biome check --write"],

	// 处理根目录的 JSON 文件
	"*.json": ["biome check --write"],

	// 处理 CSS 相关文件
	"*.{css,scss,sass,less}": ["biome check --write"],
};
