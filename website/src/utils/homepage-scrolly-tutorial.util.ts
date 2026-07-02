/**
 * @overview Builds the highlighted step data for the homepage dependency
 * injection scrollytelling tutorial from the MDX-authored document tree.
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
import HomepageTutorialDocument from "@/content/homepage/homepage-tutorial.mdx";
import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";
import { createHomepageTutorialStepId } from "@/utils/homepage-tutorial-step-id.util";

const HOMEPAGE_SCROLLY_TUTORIAL_THEME = "slack-dark";
const HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME = "homepage-tutorial.ts";

type HomepageScrollyTutorialDefinition = Readonly<{
	codeblock: RawCode;
	fileName: string;
	id: string;
	title: string;
}>;

type HomepageScrollyTutorialSection = {
	hasContentBeforeCodeBlock: boolean;
	hasLateCodeBlock: boolean;
	id: string;
	leadingCodeBlock: HomepageTutorialCodeBlock | null;
	title: string;
};

type HomepageTutorialCodeBlock = Readonly<{
	lang: string;
	value: string;
}>;

type WithChildrenProps = Readonly<{
	children?: ReactNode;
	className?: string;
	id?: string;
}>;

const PROSE_TAG_NAMES = new Set(["p", "ul", "ol", "blockquote"]);

export async function createHomepageScrollyTutorialSteps(): Promise<
	CodehikeScrollyDemoStep[]
> {
	const tutorialDefinitions = createHomepageScrollyTutorialDefinitions();
	const highlightedSteps = await Promise.all(
		tutorialDefinitions.map(async (definition, index) => {
			const code = await highlight(
				definition.codeblock,
				HOMEPAGE_SCROLLY_TUTORIAL_THEME,
			);
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
			} satisfies CodehikeScrollyDemoStep;
		}),
	);

	return highlightedSteps;
}

function createHomepageScrollyTutorialDefinitions(): HomepageScrollyTutorialDefinition[] {
	const tutorialSections = parseHomepageTutorialSections();

	return tutorialSections.flatMap((section) => {
		validateHomepageTutorialSectionCodePlacement(section);

		if (!section.leadingCodeBlock) {
			return [];
		}

		return [
			{
				codeblock: {
					lang: section.leadingCodeBlock.lang,
					meta: `title=${HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME}`,
					value: section.leadingCodeBlock.value,
				},
				fileName: HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME,
				id: section.id,
				title: section.title,
			},
		];
	});
}

function parseHomepageTutorialSections(): HomepageScrollyTutorialSection[] {
	const tutorialDocumentNode = HomepageTutorialDocument({});

	if (!isValidElement<WithChildrenProps>(tutorialDocumentNode)) {
		throw new Error(
			"Homepage tutorial document did not render a valid element.",
		);
	}

	const tutorialNodes = Children.toArray(
		tutorialDocumentNode.props.children,
	).filter((node) => !isIgnorableNode(node));
	const tutorialSections: HomepageScrollyTutorialSection[] = [];
	let currentSection: HomepageScrollyTutorialSection | null = null;

	for (const tutorialNode of tutorialNodes) {
		if (isHeadingStepNode(tutorialNode)) {
			if (currentSection) {
				tutorialSections.push(currentSection);
			}

			const title = getNodeTextContent(tutorialNode.props.children).trim();

			currentSection = {
				hasContentBeforeCodeBlock: false,
				hasLateCodeBlock: false,
				id: createHomepageTutorialStepId(title),
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
					extractHomepageTutorialCodeBlock(tutorialNode);
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

function validateHomepageTutorialSectionCodePlacement(
	section: HomepageScrollyTutorialSection,
): void {
	if (section.hasLateCodeBlock) {
		throw new Error(
			`Homepage tutorial section "${section.title}" must keep a single code block at the very start of the section.`,
		);
	}
}

function extractHomepageTutorialCodeBlock(
	node: ReactElement<WithChildrenProps>,
): HomepageTutorialCodeBlock {
	const codeElement = getHomepageTutorialCodeElement(node);
	const className = codeElement.props.className ?? "";
	const languageMatch = className.match(/language-([a-z0-9-]+)/i);

	return {
		lang: languageMatch?.[1] ?? "text",
		value: getNodeTextContent(codeElement.props.children).replace(/\n$/, ""),
	};
}

function getHomepageTutorialCodeElement(
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
			"Homepage tutorial code block did not render a <code> child inside <pre>.",
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
