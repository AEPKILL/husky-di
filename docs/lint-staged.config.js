/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 *
 * 文档包的 lint-staged 配置
 */
export default {
	// 处理 TypeScript/JavaScript 文件
	"*.{js,ts,jsx,tsx}": ["biome check --write --no-errors-on-unmatched"],

	// 处理 JSON 文件
	"*.json": ["biome check --write --no-errors-on-unmatched"],

	// 处理 CSS 相关文件
	"*.{css,scss,sass,less}": ["biome check --write --no-errors-on-unmatched"],
};
