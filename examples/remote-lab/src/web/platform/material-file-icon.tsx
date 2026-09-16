/**
 * @overview Renders the bundled Material Icon Theme assets for project files and folders.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

export function MaterialFileIcon({ path }: { path: string }) {
	return (
		<img
			className="platform-material-icon"
			src={getFileIcon(path)}
			alt=""
			width={18}
			height={18}
			draggable={false}
		/>
	);
}

export function MaterialFolderIcon({ open = false }: { open?: boolean }) {
	return (
		<img
			className="platform-material-icon"
			src={open ? ICONS.openFolder : ICONS.folder}
			alt=""
			width={18}
			height={18}
			draggable={false}
		/>
	);
}

const ICONS = {
	file: new URL("./icons/document.svg", import.meta.url).href,
	folder: new URL("./icons/folder-base.svg", import.meta.url).href,
	openFolder: new URL("./icons/folder-base-open.svg", import.meta.url).href,
	test: new URL("./icons/test-ts.svg", import.meta.url).href,
	typescript: new URL("./icons/typescript.svg", import.meta.url).href,
	javascript: new URL("./icons/javascript.svg", import.meta.url).href,
	json: new URL("./icons/json.svg", import.meta.url).href,
	markdown: new URL("./icons/markdown.svg", import.meta.url).href,
};

function getFileIcon(path: string) {
	const name = path.toLowerCase();
	if (/\.(case|test|spec)\.[cm]?tsx?$/.test(name)) return ICONS.test;
	if (/\.[cm]?tsx?$/.test(name)) return ICONS.typescript;
	if (/\.[cm]?jsx?$/.test(name)) return ICONS.javascript;
	if (/\.jsonc?$/.test(name)) return ICONS.json;
	if (/\.(md|mdx|markdown)$/.test(name)) return ICONS.markdown;
	return ICONS.file;
}
