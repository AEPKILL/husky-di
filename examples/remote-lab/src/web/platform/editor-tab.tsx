/**
 * @overview Renders editor tabs using VS Code's icon-label structure and locally bundled icons.
 * @author AEPKILL
 * @created 2026-09-16 22:14:28
 */

import { type CSSProperties, useLayoutEffect, useRef } from "react";

export function EditorTab({
	path,
	active,
	onActivate,
	onClose,
}: {
	path: string;
	active: boolean;
	onActivate: () => void;
	onClose: () => void;
}) {
	const tab = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		if (!active) return;
		tab.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
		const item = tab.current;
		const strip = item?.parentElement;
		const fill = item?.querySelector(".tab-fill");
		if (!item || !strip || !fill) return;
		const stripBox = strip.getBoundingClientRect();
		const fillBox = fill.getBoundingClientRect();
		if (fillBox.right > stripBox.right)
			strip.scrollLeft += fillBox.right - stripBox.right + 2;
		else if (fillBox.left < stripBox.left)
			strip.scrollLeft -= stripBox.left - fillBox.left + 2;
	});
	return (
		<div
			ref={tab}
			className={`platform-editor-tab tab${active ? " active" : ""}`}
		>
			<div className="tab-fill" aria-hidden="true" />
			<button
				type="button"
				role="tab"
				className="monaco-icon-label file-icon tab-label"
				style={
					{
						"--tab-file-icon": `url("${getEditorFileIcon(path)}")`,
					} as CSSProperties
				}
				aria-selected={active}
				onClick={onActivate}
				title={path}
			>
				<span className="monaco-icon-label-container">
					<span className="monaco-icon-name-container">
						<span className="label-name">{path.split("/").at(-1)}</span>
					</span>
				</span>
			</button>
			<div className="tab-actions">
				<button
					type="button"
					className="tab-close"
					aria-label={`Close ${path}`}
					title="Close"
					onClick={onClose}
				>
					<span className="codicon-close-small" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}

function getEditorFileIcon(path: string) {
	const name = path.toLowerCase();
	if (/\.(case|test|spec)\.[cm]?tsx?$/.test(name)) return ICONS.test;
	if (/\.tsx$/.test(name)) return ICONS.reactTypescript;
	if (/\.[cm]?ts$/.test(name)) return ICONS.typescript;
	if (/\.jsx$/.test(name)) return ICONS.reactJavascript;
	if (/\.[cm]?js$/.test(name)) return ICONS.javascript;
	if (/\.jsonc?$/.test(name)) return ICONS.json;
	if (/\.(md|mdx|markdown)$/.test(name)) return ICONS.markdown;
	return ICONS.file;
}

const ICONS = {
	file: new URL("./icons/vscode/default_file.svg", import.meta.url).href,
	test: new URL("./icons/vscode/file_type_testts.svg", import.meta.url).href,
	typescript: new URL(
		"./icons/vscode/file_type_typescript.svg",
		import.meta.url,
	).href,
	reactTypescript: new URL(
		"./icons/vscode/file_type_reactts.svg",
		import.meta.url,
	).href,
	javascript: new URL("./icons/vscode/file_type_js.svg", import.meta.url).href,
	reactJavascript: new URL(
		"./icons/vscode/file_type_reactjs.svg",
		import.meta.url,
	).href,
	json: new URL("./icons/vscode/file_type_json.svg", import.meta.url).href,
	markdown: new URL("./icons/vscode/file_type_markdown.svg", import.meta.url)
		.href,
};
