import path from "node:path";

/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 *
 * 根目录的 lint-staged 配置
 * 仅处理根目录的文件，不包括 packages/ 目录下的文件
 * 每个 package 都有自己的配置文件
 */
const toRelativePath = (file) =>
	path.isAbsolute(file) ? path.relative(process.cwd(), file) : file;

const createBiomeTask = (files) => {
	const scopedFiles = files.filter((file) => {
		const relativeFile = toRelativePath(file).replaceAll("\\", "/");
		return !relativeFile.startsWith(".agents/");
	});

	if (scopedFiles.length === 0) {
		return [];
	}

	return [`biome check --write ${scopedFiles.join(" ")}`];
};

export default {
	// 处理根目录的 TypeScript/JavaScript 文件
	"*.{js,ts,jsx,tsx}": createBiomeTask,

	// 处理根目录的 JSON 文件
	"*.json": createBiomeTask,

	// 处理 CSS 相关文件
	"*.{css,scss,sass,less}": createBiomeTask,
};
