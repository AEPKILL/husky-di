/**
 * @overview Integrates persistent Monaco file models with the project's TypeScript service and snapshot navigation.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/typescript/register";
import "monaco-editor/languages/definitions/javascript/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { useEffect, useRef } from "react";
import {
	type PlatformDiagnostic,
	type PlatformSourceLocation,
	platformRequest,
	projectPath,
} from "./platform-api";
import { PlatformThemeEnum } from "./use-platform-theme";

export type ProjectEditorProps = {
	theme: PlatformThemeEnum.light | PlatformThemeEnum.dark;
	projectId: string;
	documents: { path: string; content: string; readOnly?: boolean }[];
	activePath?: string;
	snapshotId?: string;
	diagnostics: PlatformDiagnostic[];
	location?: PlatformSourceLocation;
	onEdit(path: string, content: string): void;
	onNavigate(location: PlatformSourceLocation): void;
	onError(message: string): void;
	onReadSource(source: { path: string; content: string }): void;
};

export function ProjectEditor(props: ProjectEditorProps) {
	const container = useRef<HTMLElement>(null);
	const latest = useRef(props);
	latest.current = props;
	const editor = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(
		undefined,
	);
	const models = useRef(
		new Map<
			string,
			{
				model: monaco.editor.ITextModel;
				view: monaco.editor.ICodeEditorViewState | null;
				subscription: monaco.IDisposable;
			}
		>(),
	);
	const suppress = useRef(false);
	const previous = useRef<string | undefined>(undefined);
	const scope = props.snapshotId
		? `history/${props.snapshotId}`
		: `project/${props.projectId}`;

	useEffect(() => {
		if (!container.current) return;
		(
			globalThis as typeof globalThis & {
				MonacoEnvironment: monaco.Environment;
			}
		).MonacoEnvironment = {
			getWorker: () => new EditorWorker(),
		};
		applyEditorTheme(container.current, latest.current.theme);
		const instance = monaco.editor.create(container.current, {
			model: null,
			theme: "lab-material",
			automaticLayout: true,
			fontSize: 13,
			fontFamily: "'SFMono-Regular', Consolas, monospace",
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			scrollbar: {
				verticalScrollbarSize: 8,
				horizontalScrollbarSize: 3,
				useShadows: false,
			},
			padding: { top: 14 },
			accessibilitySupport: "on",
			ariaLabel: "TypeScript source editor",
		});
		editor.current = instance;
		const languageRequest = <T,>(
			action: string,
			path: string,
			position: number,
		) =>
			platformRequest<T>(
				`${projectPath(latest.current.projectId)}/language`,
				"POST",
				{
					action,
					path,
					position,
					overlays: Object.fromEntries(
						latest.current.documents
							.filter((document) => !document.readOnly)
							.map((document) => [document.path, document.content]),
					),
				},
			);
		const completions = monaco.languages.registerCompletionItemProvider(
			["typescript", "javascript"],
			{
				triggerCharacters: [".", "'", '"', "/"],
				async provideCompletionItems(model, position, _context, token) {
					if (latest.current.snapshotId) return { suggestions: [] };
					const path = locatePath(model, models.current);
					if (!path) return { suggestions: [] };
					try {
						const entries = await languageRequest<
							{
								name: string;
								kind: string;
								sortText: string;
								insertText?: string;
								replacementSpan?: { start: number; length: number };
							}[]
						>("completions", path, model.getOffsetAt(position));
						if (token.isCancellationRequested) return { suggestions: [] };
						const word = model.getWordUntilPosition(position);
						return {
							suggestions: entries.map((entry) => ({
								label: entry.name,
								kind: monaco.languages.CompletionItemKind.Property,
								detail: entry.kind,
								insertText: entry.insertText ?? entry.name,
								sortText: entry.sortText,
								range: entry.replacementSpan
									? offsetRange(
											model,
											entry.replacementSpan.start,
											entry.replacementSpan.length,
										)
									: new monaco.Range(
											position.lineNumber,
											word.startColumn,
											position.lineNumber,
											word.endColumn,
										),
							})),
						};
					} catch (failure) {
						latest.current.onError(`Language service: ${String(failure)}`);
						return { suggestions: [] };
					}
				},
			},
		);
		const definitions = monaco.languages.registerDefinitionProvider(
			["typescript", "javascript"],
			{
				async provideDefinition(model, position, token) {
					if (latest.current.snapshotId) return [];
					const path = locatePath(model, models.current);
					if (!path) return [];
					try {
						const targets = await languageRequest<
							{ path: string; start: number; length: number }[]
						>("definitions", path, model.getOffsetAt(position));
						if (token.isCancellationRequested) return [];
						return Promise.all(
							targets.map(async (target) => {
								const key = `project/${latest.current.projectId}/${target.path}`;
								let document = models.current.get(key);
								if (!document) {
									const source = await platformRequest<{
										path: string;
										content: string;
									}>(
										`${projectPath(latest.current.projectId)}/language`,
										"POST",
										{ action: "source", path: target.path },
									);
									const targetModel = monaco.editor.createModel(
										source.content,
										"typescript",
										monaco.Uri.from({ scheme: "file", path: `/lab/${key}` }),
									);
									document = {
										model: targetModel,
										view: null,
										subscription: { dispose() {} },
									};
									models.current.set(key, document);
									latest.current.onReadSource(source);
								}
								return {
									uri: document.model.uri,
									range: offsetRange(
										document.model,
										target.start,
										target.length,
									),
								};
							}),
						);
					} catch (failure) {
						latest.current.onError(`Language service: ${String(failure)}`);
						return [];
					}
				},
			},
		);
		const opener = monaco.editor.registerEditorOpener({
			openCodeEditor(_source, resource, selection) {
				const document = [...models.current.entries()].find(
					([, value]) => value.model.uri.toString() === resource.toString(),
				);
				if (!document) return false;
				const selectionLine =
					selection && "startLineNumber" in selection
						? selection.startLineNumber
						: selection?.lineNumber;
				const selectionColumn =
					selection && "startColumn" in selection
						? selection.startColumn
						: selection?.column;
				latest.current.onNavigate({
					path: document[0].split("/").slice(2).join("/"),
					line: selectionLine,
					column: selectionColumn,
				});
				return true;
			},
		});
		return () => {
			completions.dispose();
			definitions.dispose();
			opener.dispose();
			instance.dispose();
			for (const document of models.current.values()) {
				document.subscription.dispose();
				document.model.dispose();
			}
			models.current.clear();
			editor.current = undefined;
		};
	}, []);

	useEffect(() => {
		if (container.current) applyEditorTheme(container.current, props.theme);
	}, [props.theme]);

	useEffect(() => {
		for (const source of props.documents) {
			const key = `${scope}/${source.path}`;
			let document = models.current.get(key);
			if (!document) {
				const model = monaco.editor.createModel(
					source.content,
					/\.[cm]?[jt]sx?$/.test(source.path) ? "typescript" : "plaintext",
					monaco.Uri.from({ scheme: "file", path: `/lab/${key}` }),
				);
				document = {
					model,
					view: null,
					subscription: model.onDidChangeContent(() => {
						if (
							!suppress.current &&
							!key.startsWith("history/") &&
							!source.readOnly
						)
							latest.current.onEdit(source.path, model.getValue());
					}),
				};
				models.current.set(key, document);
			} else if (document.model.getValue() !== source.content) {
				suppress.current = true;
				// Full-file edits preserve the model and its undo stack, unlike setValue or recreation.
				document.model.pushEditOperations(
					[],
					[{ range: document.model.getFullModelRange(), text: source.content }],
					() => null,
				);
				suppress.current = false;
			}
		}
		const key = props.activePath ? `${scope}/${props.activePath}` : undefined;
		if (key !== previous.current) {
			const current = previous.current
				? models.current.get(previous.current)
				: undefined;
			if (current) current.view = editor.current?.saveViewState() ?? null;
			const next = key ? models.current.get(key) : undefined;
			editor.current?.setModel(next?.model ?? null);
			if (next?.view) editor.current?.restoreViewState(next.view);
			previous.current = key;
		}
		editor.current?.updateOptions({
			readOnly:
				Boolean(props.snapshotId) ||
				Boolean(
					props.documents.find((source) => source.path === props.activePath)
						?.readOnly,
				),
		});
	}, [props.documents, props.activePath, props.snapshotId, scope]);

	useEffect(() => {
		for (const [key, document] of models.current) {
			if (!key.startsWith(`${scope}/`)) continue;
			const path = key.slice(scope.length + 1);
			monaco.editor.setModelMarkers(
				document.model,
				"project-typescript",
				props.snapshotId
					? []
					: props.diagnostics
							.filter((diagnostic) => diagnostic.path === path)
							.map((diagnostic) => ({
								...offsetRange(
									document.model,
									diagnostic.start,
									diagnostic.length,
								),
								message: diagnostic.message,
								code: String(diagnostic.code),
								source: "TypeScript",
								severity:
									diagnostic.category === "error"
										? monaco.MarkerSeverity.Error
										: monaco.MarkerSeverity.Warning,
							})),
			);
		}
	}, [props.diagnostics, props.snapshotId, scope]);

	useEffect(() => {
		const location = props.location;
		if (!location || location.path !== props.activePath) return;
		const model = editor.current?.getModel();
		if (!model) return;
		const position =
			location.start === undefined
				? { lineNumber: location.line ?? 1, column: location.column ?? 1 }
				: model.getPositionAt(location.start);
		editor.current?.setPosition(position);
		editor.current?.revealPositionInCenter(position);
		const focused = container.current?.ownerDocument.activeElement;
		// Loading the editor or restoring a location must not steal an in-progress
		// project path, file name or native select interaction in another pane.
		if (
			!focused?.matches("input, textarea, select") ||
			container.current?.contains(focused)
		)
			editor.current?.focus();
	}, [props.location, props.activePath]);

	return (
		<section
			ref={container}
			className="platform-editor"
			data-testid="project-editor"
			aria-label={
				props.snapshotId
					? "Historical source snapshot (read only)"
					: "Current project source"
			}
		/>
	);
}

function applyEditorTheme(
	container: HTMLElement,
	theme: ProjectEditorProps["theme"],
) {
	const styles = getComputedStyle(container);
	const color = (token: string) => styles.getPropertyValue(token).trim();
	monaco.editor.defineTheme("lab-material", {
		base: theme === PlatformThemeEnum.dark ? "vs-dark" : "vs",
		inherit: true,
		rules:
			theme === PlatformThemeEnum.dark
				? [
						{ token: "comment", foreground: "4F6875", fontStyle: "italic" },
						{ token: "keyword", foreground: "C792EA" },
						{ token: "string", foreground: "C3E88D" },
						{ token: "number", foreground: "F78C6A" },
						{ token: "type", foreground: "FFCB6B" },
						{ token: "function", foreground: "82AAFF" },
					]
				: [],
		colors: {
			"editor.background": color("--lab-editor"),
			"editor.foreground": color("--lab-editor-foreground"),
			"editorLineNumber.foreground": color("--lab-editor-line-number"),
			"editorLineNumber.activeForeground": color("--lab-editor-foreground"),
			"editorCursor.foreground": color("--lab-accent"),
			"editor.selectionBackground": color("--lab-editor-selection"),
			"editor.lineHighlightBackground": color("--lab-editor-line"),
			"editorWidget.background": color("--lab-panel"),
			"editorSuggestWidget.background": color("--lab-panel"),
			"editorGutter.background": color("--lab-editor"),
			focusBorder: color("--lab-accent"),
		},
	});
	monaco.editor.setTheme("lab-material");
}

function locatePath(
	model: monaco.editor.ITextModel,
	models: Map<string, { model: monaco.editor.ITextModel }>,
): string | undefined {
	const key = [...models].find(([, document]) => document.model === model)?.[0];
	return key?.split("/").slice(2).join("/");
}

function offsetRange(
	model: monaco.editor.ITextModel,
	start: number,
	length: number,
): monaco.Range {
	const from = model.getPositionAt(start);
	const to = model.getPositionAt(start + Math.max(1, length));
	return new monaco.Range(
		from.lineNumber,
		from.column,
		to.lineNumber,
		to.column,
	);
}
