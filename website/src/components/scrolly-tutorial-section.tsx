/**
 * @overview Generic scrollytelling tutorial layout for MDX-authored content.
 * @author AEPKILL
 * @created 2026-07-01 19:25:00
 */

import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
import { TutorialCodePreview } from "@/components/tutorial-code-preview";

export type ScrollyTutorialSectionProps = Readonly<{
	children: ReactNode;
	description: string;
	eyebrow?: string;
	id?: string;
	title: string;
}>;

type TutorialStepData = Readonly<{
	contentNodes: readonly ReactNode[];
	id: string;
	previewNodes: readonly ReactNode[];
	title: string;
}>;

type WithChildrenProps = Readonly<{
	children?: ReactNode;
}>;

type CodeElementProps = Readonly<{
	children?: ReactNode;
	className?: string;
}>;

const PROSE_TAG_NAMES = new Set(["p", "ul", "ol", "blockquote"]);

export function ScrollyTutorialSection({
	children,
	description,
	eyebrow = "Tutorial",
	id,
	title,
}: ScrollyTutorialSectionProps) {
	const tutorialSteps = createTutorialSteps(children);

	return (
		<section
			className="relative overflow-hidden border-y border-border bg-page-bg"
			id={id}
		>
			<div className="absolute inset-y-0 left-0 hidden bg-surface-deep xl:block xl:w-1/2" />
			<div className="absolute inset-y-0 right-0 hidden bg-surface-alt xl:block xl:w-1/2" />

			<div className="relative">
				<div className="mx-auto w-full xl:min-w-[1020px] xl:max-w-[1440px] xl:px-0">
					<div className="bg-surface-alt px-6 py-16 xl:ml-auto xl:w-1/2 xl:px-0 xl:py-28">
						<div className="mx-auto max-w-[42rem] xl:ml-0 xl:w-[420px] xl:max-w-none xl:pl-[85px]">
							<p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-accent">
								{eyebrow}
							</p>
							<h2 className="mt-4 text-4xl leading-none font-black tracking-[-0.05em] text-page-fg md:text-[3.2rem]">
								{title}
							</h2>
							<p className="mt-6 text-[15px] leading-8 text-page-muted md:text-base">
								{description}
							</p>

							<div className="mt-14 space-y-16 xl:space-y-24">
								{tutorialSteps.map((tutorialStep, tutorialStepIndex) => (
									<ScrollyTutorialStepBlock
										key={tutorialStep.id}
										stepIndex={tutorialStepIndex}
										step={tutorialStep}
									/>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

type ScrollyTutorialStepBlockProps = Readonly<{
	stepIndex: number;
	step: TutorialStepData;
}>;

function ScrollyTutorialStepBlock({
	step,
	stepIndex,
}: ScrollyTutorialStepBlockProps) {
	return (
		<section
			className="scroll-mt-28 xl:relative xl:ml-[-590px] xl:flex xl:w-[1010px]"
			id={step.id}
		>
			<div className="xl:w-[420px] xl:pr-[85px]">
				<div className="space-y-4 xl:sticky xl:top-[20vh]">
					{step.previewNodes.length > 0 ? (
						step.previewNodes
					) : (
						<div className="rounded-[1.5rem] border border-border-soft bg-surface-glass px-5 py-4 text-sm leading-7 text-page-muted">
							Add a code block or a component under this heading to populate the
							left preview panel.
						</div>
					)}
				</div>
			</div>

			<div className="mt-8 xl:mt-0 xl:w-[420px]">
				<div className="relative pl-10">
					<div className="absolute bottom-0 left-4 top-0 w-px bg-border" />
					<div className="absolute left-[9px] top-2 h-3 w-3 rounded-full border border-accent-border bg-surface-alt" />

					<p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-accent">
						{getStepEyebrow(stepIndex)}
					</p>
					<h3 className="mt-3 text-[2rem] leading-none font-black tracking-[-0.04em] text-page-fg">
						{step.title}
					</h3>

					<div className="mt-5 space-y-5 text-[15px] leading-8 text-page-soft [&_a]:text-accent [&_code]:rounded-sm [&_code]:bg-black/30 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-code-symbol [&_li]:ml-6 [&_li]:list-disc [&_li]:text-[15px] [&_li]:leading-8 [&_strong]:font-semibold [&_ul]:space-y-2">
						{step.contentNodes}
					</div>
				</div>
			</div>
		</section>
	);
}

function createTutorialSteps(children: ReactNode): TutorialStepData[] {
	const tutorialNodes = Children.toArray(children).filter(
		(node) => !isIgnorableNode(node),
	);

	const tutorialSteps: TutorialStepData[] = [];
	let currentStep: {
		contentNodes: ReactNode[];
		id: string;
		previewNodes: ReactNode[];
		title: string;
	} | null = null;

	for (const tutorialNode of tutorialNodes) {
		if (isHeadingStepNode(tutorialNode)) {
			if (currentStep) {
				tutorialSteps.push(currentStep);
			}

			const stepTitle = getNodeTextContent(tutorialNode.props.children).trim();

			currentStep = {
				contentNodes: [],
				id: tutorialNode.props.id ?? createSlug(stepTitle),
				previewNodes: [],
				title: stepTitle,
			};
			continue;
		}

		if (!currentStep) {
			continue;
		}

		if (isPreviewNode(tutorialNode)) {
			currentStep.previewNodes.push(
				createPreviewNode(tutorialNode, currentStep.title),
			);
			continue;
		}

		currentStep.contentNodes.push(tutorialNode);
	}

	if (currentStep) {
		tutorialSteps.push(currentStep);
	}

	return tutorialSteps;
}

function isHeadingStepNode(
	node: ReactNode,
): node is ReactElement<{ children?: ReactNode; id?: string }> {
	return isIntrinsicElement(node, "h2");
}

function isPreviewNode(
	node: ReactNode,
): node is ReactElement<WithChildrenProps> {
	if (!isValidElement(node)) {
		return false;
	}

	if (isIntrinsicElement(node, "pre")) {
		return true;
	}

	if (typeof node.type !== "string") {
		return true;
	}

	return false;
}

function createPreviewNode(
	node: ReactElement<WithChildrenProps>,
	stepTitle: string,
): ReactNode {
	if (isIntrinsicElement(node, "pre")) {
		return createCodePreviewNode(node, stepTitle);
	}

	return node;
}

function createCodePreviewNode(
	node: ReactElement<WithChildrenProps>,
	stepTitle: string,
): ReactElement {
	const codeNode = getCodeChildNode(node);
	const codeClassName =
		typeof codeNode?.props.className === "string"
			? codeNode.props.className
			: "";

	return (
		<TutorialCodePreview
			code={getNodeTextContent(codeNode?.props.children ?? "")}
			fileName={getCodePreviewFileName(codeClassName)}
			key={`${stepTitle}-${codeClassName}`}
			title={stepTitle}
		/>
	);
}

function getCodeChildNode(
	node: ReactElement<WithChildrenProps>,
): ReactElement<CodeElementProps> | null {
	const childNodes = Children.toArray(node.props.children);

	for (const childNode of childNodes) {
		if (
			isValidElement<CodeElementProps>(childNode) &&
			isIntrinsicElement<CodeElementProps>(childNode, "code")
		) {
			return childNode;
		}
	}

	return null;
}

function getCodePreviewFileName(codeClassName: string): string {
	const languageName = codeClassName.replace(/^language-/, "").toLowerCase();

	switch (languageName) {
		case "ts":
			return "example.ts";
		case "tsx":
			return "example.tsx";
		case "js":
			return "example.js";
		case "jsx":
			return "example.jsx";
		case "json":
			return "example.json";
		case "bash":
		case "sh":
		case "shell":
			return "example.sh";
		default:
			return "example.txt";
	}
}

function getStepEyebrow(stepIndex: number): string {
	return `Step ${stepIndex + 1}`;
}

function getNodeTextContent(node: ReactNode): string {
	return Children.toArray(node)
		.map((childNode) => {
			if (typeof childNode === "string" || typeof childNode === "number") {
				return String(childNode);
			}

			if (!isValidElement(childNode)) {
				return "";
			}

			return getNodeTextContent(
				(childNode as ReactElement<WithChildrenProps>).props.children,
			);
		})
		.join("");
}

function createSlug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
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
