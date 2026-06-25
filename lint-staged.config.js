import path from "node:path";

/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 *
 * Root-level lint-staged configuration
 * Only handles files in the repository root, excluding files under packages/
 * Each package keeps its own configuration file
 */
const toRelativePath = (file) =>
	path.isAbsolute(file) ? path.relative(process.cwd(), file) : file;

const createBiomeTask = (files) => {
	const scopedFiles = files.filter((file) => {
		const relativeFile = toRelativePath(file).replaceAll("\\", "/");
		return !relativeFile.includes("/") && !relativeFile.startsWith(".agents/");
	});

	if (scopedFiles.length === 0) {
		return [];
	}

	return [
		`biome check --write --no-errors-on-unmatched ${scopedFiles.join(" ")}`,
	];
};

export default {
	// Handle root-level TypeScript and JavaScript files
	"*.{js,ts,jsx,tsx}": createBiomeTask,

	// Handle root-level JSON files
	"*.json": createBiomeTask,

	// Handle CSS-related files
	"*.{css,scss,sass,less}": createBiomeTask,
};
