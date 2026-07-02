/**
 * @overview Builds highlighted step data for MDX-authored scrolly tutorial
 * documents.
 * @author AEPKILL
 * @created 2026-07-02 14:35:00
 */

import type { RawCode } from "codehike/code";
import { highlight } from "codehike/code";
import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
import type { ScrollyTutorialStep } from "@/types/scrolly-tutorial-step.type";
import { createScrollyTutorialStepId } from "@/utils/scrolly-tutorial-step-id.util";

const DEFAULT_SCROLLY_TUTORIAL_FILE_NAME = "tutorial.ts";

type ScrollyTutorialDefinition = Readonly<{
	codeblock: RawCode;
	fileName: string;
	id: string;
	title: string;
}>;

type ScrollyTutorialSection = {
	hasContentBeforeCodeBlock: boolean;
	hasLateCodeBlock: boolean;
	id: string;
	leadingCodeBlock: ScrollyTutorialCodeBlock | null;
	title: string;
};

type ScrollyTutorialCodeBlock = Readonly<{
	lang: string;
	value: string;
}>;

type WithChildrenProps = Readonly<{
	children?: ReactNode;
	className?: string;
	id?: string;
}>;

type ScrollyTutorialDocument = (props: Record<string, never>) => ReactNode;
type ScrollyTutorialTheme = Parameters<typeof highlight>[1];

const DEFAULT_SCROLLY_TUTORIAL_THEME = "slack-dark" as ScrollyTutorialTheme;

const PROSE_TAG_NAMES = new Set(["p", "ul", "ol", "blockquote"]);

export type CreateScrollyTutorialStepsOptions = Readonly<{
	document: ScrollyTutorialDocument;
	fileName?: string;
	theme?: ScrollyTutorialTheme;
}>;

export async function createScrollyTutorialSteps({
	document,
	fileName = DEFAULT_SCROLLY_TUTORIAL_FILE_NAME,
	theme,
}: CreateScrollyTutorialStepsOptions): Promise<ScrollyTutorialStep[]> {
	const resolvedTheme: ScrollyTutorialTheme =
		theme ?? DEFAULT_SCROLLY_TUTORIAL_THEME;
	const tutorialDefinitions = createScrollyTutorialDefinitions({
		document,
		fileName,
	});
	const highlightedSteps = await Promise.all(
		tutorialDefinitions.map(async (definition, index) => {
			const code = await highlight(definition.codeblock, resolvedTheme);
			const previousDefinition =
				index > 0 ? tutorialDefinitions[index - 1] : null;

			return {
				id: definition.id,
				eyebrow: `Step ${index + 1}`,
				fileName: definition.fileName,
				focusLineIndex: getFirstChangedLineIndex(
					previousDefinition?.codeblock.value,
					definition.codeblock.value,
				),
				title: definition.title,
				summary: "",
				details: [],
				code,
			} satisfies ScrollyTutorialStep;
		}),
	);

	return highlightedSteps;
}

type CreateScrollyTutorialDefinitionsOptions = Readonly<{
	document: ScrollyTutorialDocument;
	fileName: string;
}>;

function createScrollyTutorialDefinitions({
	document,
	fileName,
}: CreateScrollyTutorialDefinitionsOptions): ScrollyTutorialDefinition[] {
	const tutorialSections = parseScrollyTutorialSections(document);

	return tutorialSections.flatMap((section) => {
		validateScrollyTutorialSectionCodePlacement(section);

		if (!section.leadingCodeBlock) {
			return [];
		}

		return [
			{
				codeblock: {
					lang: section.leadingCodeBlock.lang,
					meta: `title=${fileName}`,
					value: section.leadingCodeBlock.value,
				},
				fileName,
				id: section.id,
				title: section.title,
			},
		];
	});
}

function parseScrollyTutorialSections(
	document: ScrollyTutorialDocument,
): ScrollyTutorialSection[] {
	const tutorialDocumentNode = document({});

	if (!isValidElement<WithChildrenProps>(tutorialDocumentNode)) {
		throw new Error(
			"Scrolly tutorial document did not render a valid element.",
		);
	}

	const tutorialNodes = Children.toArray(
		tutorialDocumentNode.props.children,
	).filter((node) => !isIgnorableNode(node));
	const tutorialSections: ScrollyTutorialSection[] = [];
	let currentSection: ScrollyTutorialSection | null = null;

	for (const tutorialNode of tutorialNodes) {
		if (isHeadingStepNode(tutorialNode)) {
			if (currentSection) {
				tutorialSections.push(currentSection);
			}

			const title = getNodeTextContent(tutorialNode.props.children).trim();

			currentSection = {
				hasContentBeforeCodeBlock: false,
				hasLateCodeBlock: false,
				id: createScrollyTutorialStepId(title),
				leadingCodeBlock: null,
				title,
			};
			continue;
		}

		if (!currentSection) {
			continue;
		}

		if (isCodeBlockNode(tutorialNode)) {
			if (!currentSection.leadingCodeBlock) {
				if (currentSection.hasContentBeforeCodeBlock) {
					currentSection.hasLateCodeBlock = true;
					continue;
				}

				currentSection.leadingCodeBlock =
					extractScrollyTutorialCodeBlock(tutorialNode);
			} else {
				currentSection.hasLateCodeBlock = true;
			}
			continue;
		}

		if (!currentSection.leadingCodeBlock) {
			currentSection.hasContentBeforeCodeBlock = true;
		}
	}

	if (currentSection) {
		tutorialSections.push(currentSection);
	}

	return tutorialSections;
}

function validateScrollyTutorialSectionCodePlacement(
	section: ScrollyTutorialSection,
): void {
	if (section.hasLateCodeBlock) {
		throw new Error(
			`Scrolly tutorial section "${section.title}" must keep a single code block at the very start of the section.`,
		);
	}
}

function extractScrollyTutorialCodeBlock(
	node: ReactElement<WithChildrenProps>,
): ScrollyTutorialCodeBlock {
	const codeElement = getScrollyTutorialCodeElement(node);
	const className = codeElement.props.className ?? "";
	const languageMatch = className.match(/language-([a-z0-9-]+)/i);

	return {
		lang: languageMatch?.[1] ?? "text",
		value: getNodeTextContent(codeElement.props.children).replace(/\n$/, ""),
	};
}

function getScrollyTutorialCodeElement(
	node: ReactElement<WithChildrenProps>,
): ReactElement<WithChildrenProps> {
	const codeChildNode = Children.toArray(node.props.children).find(
		(childNode) => isIntrinsicElement(childNode, "code"),
	);

	if (
		!codeChildNode ||
		!isIntrinsicElement<WithChildrenProps>(codeChildNode, "code")
	) {
		throw new Error(
			"Scrolly tutorial code block did not render a <code> child inside <pre>.",
		);
	}

	return codeChildNode;
}

function isHeadingStepNode(
	node: ReactNode,
): node is ReactElement<WithChildrenProps> {
	return isIntrinsicElement(node, "h2");
}

function isCodeBlockNode(
	node: ReactNode,
): node is ReactElement<WithChildrenProps> {
	return isIntrinsicElement(node, "pre");
}

function isIntrinsicElement<TProps extends { children?: ReactNode }>(
	node: ReactNode,
	tagName: string,
): node is ReactElement<TProps> {
	return isValidElement(node) && node.type === tagName;
}

function isIgnorableNode(node: ReactNode): boolean {
	if (typeof node === "string") {
		return node.trim().length === 0;
	}

	if (!isValidElement<WithChildrenProps>(node)) {
		return false;
	}

	if (
		typeof node.type === "string" &&
		PROSE_TAG_NAMES.has(node.type) &&
		getNodeTextContent(node.props.children).trim().length === 0
	) {
		return true;
	}

	return false;
}

function getNodeTextContent(node: ReactNode): string {
	return Children.toArray(node)
		.map((childNode) => {
			if (typeof childNode === "string" || typeof childNode === "number") {
				return String(childNode);
			}

			if (!isValidElement<WithChildrenProps>(childNode)) {
				return "";
			}

			return getNodeTextContent(childNode.props.children);
		})
		.join("");
}

function getFirstChangedLineIndex(
	previousCode: string | undefined,
	nextCode: string,
): number {
	if (!previousCode) {
		return 0;
	}

	const previousLines = previousCode.split("\n");
	const nextLines = nextCode.split("\n");
	const shortestLength = Math.min(previousLines.length, nextLines.length);

	for (let lineIndex = 0; lineIndex < shortestLength; lineIndex += 1) {
		if (previousLines[lineIndex] !== nextLines[lineIndex]) {
			return lineIndex;
		}
	}

	return Math.max(0, Math.min(previousLines.length, nextLines.length - 1));
}
