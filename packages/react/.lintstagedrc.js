/**
 * @filename: .lintstagedrc.js
 * @type {import('lint-staged').Configuration}
 *
 * React 包的 lint-staged 配置
 */
export default {
	// 处理 TypeScript/JavaScript 文件
	"*.{js,ts,jsx,tsx}": ["biome check --write"],

	// 处理 JSON 文件
	"*.json": ["biome check --write"],

	// 处理 CSS 相关文件（React 包通常有更多样式文件）
	"*.{css,scss,sass,less,module.css,module.scss}": ["biome check --write"],
};
