/**
 * @overview MDX-driven scrollytelling layout with a single fixed left preview
 * rail and right-side narrative sections.
 * @author AEPKILL
 * @created 2026-07-02 18:20:00
 */

import { Pre } from "codehike/code";
import { SelectionProvider, useSelectedIndex } from "codehike/utils/selection";
import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
} from "react";
import { CODEHIKE_TOKEN_TRANSITIONS } from "@/components/codehike-token-transitions";
import { createScrollyTutorialStepId } from "@/utils/scrolly-tutorial-step-id.util";
import {
	useScrollyTutorialCodeStep,
	useScrollyTutorialCodeStepsMap,
} from "./scrolly-tutorial-code-steps.context";

const CODE_LINE_HEIGHT_PX = 24;
const CODE_FOCUS_TOP_OFFSET_RATIO = 0.24;
const PREVIEW_LAYER_TRAVEL_PERCENT = 104;
const STEP_TITLE_SELECTION_TOP_PX = 48;

export type ScrollyTutorialProps = Readonly<{
	children: ReactNode;
	id?: string;
}>;

type TutorialPreviewDescriptor =
	| Readonly<{
			kind: "code";
			stepId: string;
	  }>
	| Readonly<{
			kind: "node";
			node: ReactNode;
	  }>;

type TutorialStepData = Readonly<{
	contentNodes: readonly ReactNode[];
	id: string;
	preview: TutorialPreviewDescriptor | null;
	title: string;
}>;

type WithChildrenProps = Readonly<{
	children?: ReactNode;
}>;

const PROSE_TAG_NAMES = new Set(["p", "ul", "ol", "blockquote"]);

export function ScrollyTutorial({ children, id }: ScrollyTutorialProps) {
	const tutorialSteps = createTutorialSteps(children);

	return (
		<section className="border-y border-border bg-page-bg text-page-fg" id={id}>
			<div className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-18 xl:py-24">
				<SelectionProvider className="grid gap-10 xl:grid-cols-[minmax(0,1.08fr)_minmax(23rem,28rem)] xl:gap-16">
					<ScrollyTutorialPreviewRail steps={tutorialSteps} />
					<ScrollyTutorialNarrativeRail steps={tutorialSteps} />
				</SelectionProvider>
			</div>
		</section>
	);
}

type ScrollyTutorialNarrativeRailProps = Readonly<{
	steps: readonly TutorialStepData[];
}>;

function ScrollyTutorialNarrativeRail({
	steps,
}: ScrollyTutorialNarrativeRailProps) {
	const [selectedIndex, selectIndex] = useSelectedIndex();
	const stepTitleRefs = useRef<Array<HTMLHeadingElement | null>>([]);

	useEffect(() => {
		const updateSelectedStep = () => {
			let nextSelectedIndex = 0;

			for (const [index, titleElement] of stepTitleRefs.current.entries()) {
				if (
					titleElement &&
					titleElement.getBoundingClientRect().top <=
						STEP_TITLE_SELECTION_TOP_PX
				) {
					nextSelectedIndex = index;
				}
			}

			selectIndex(nextSelectedIndex);
		};

		updateSelectedStep();

		window.addEventListener("resize", updateSelectedStep);
		window.addEventListener("scroll", updateSelectedStep, {
			passive: true,
		});

		return () => {
			window.removeEventListener("resize", updateSelectedStep);
			window.removeEventListener("scroll", updateSelectedStep);
		};
	}, [selectIndex]);

	return (
		<div className="max-xl:pb-4 xl:relative xl:pl-8 xl:before:absolute xl:before:bottom-0 xl:before:left-[-2rem] xl:before:top-0 xl:before:border-l xl:before:border-dashed xl:before:border-border-strong">
			<div className="space-y-0">
				{steps.map((step, index) => (
					<div
						className="pt-0 pb-10 last:pb-[26svh] xl:min-h-[38svh] xl:pb-14 data-[selected=true]:[&_article_h3]:text-page-fg data-[selected=true]:[&_article_p]:text-page-soft"
						data-index={index}
						data-selected={selectedIndex === index}
						key={step.id}
					>
						<article className="w-full max-w-[30rem] space-y-5">
							<h3
								className="text-[1.6rem] leading-tight font-black tracking-[-0.03em] text-page-subtle transition md:text-[1.9rem]"
								ref={(element) => {
									stepTitleRefs.current[index] = element;
								}}
							>
								{step.title}
							</h3>
							<div className="space-y-4 text-[15px] leading-8 text-page-muted transition [&_a]:text-accent [&_code]:rounded-sm [&_code]:bg-black/30 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-code-symbol [&_li]:ml-6 [&_li]:list-disc [&_li]:text-[15px] [&_li]:leading-8 [&_strong]:font-semibold [&_ul]:space-y-2">
								{step.contentNodes}
							</div>
						</article>
					</div>
				))}
			</div>
		</div>
	);
}

type ScrollyTutorialPreviewRailProps = Readonly<{
	steps: readonly TutorialStepData[];
}>;

function ScrollyTutorialPreviewRail({
	steps,
}: ScrollyTutorialPreviewRailProps) {
	const [selectedIndex] = useSelectedIndex();
	const codeSteps = useScrollyTutorialCodeStepsMap();
	const previewRailRef = useRef<HTMLDivElement | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const introPreview = steps[0]?.preview ?? null;
	const visiblePreview = getVisibleTutorialPreview(steps, selectedIndex);
	const isIntroPreviewActive = visiblePreview === introPreview;
	const previewSwapProgress = isIntroPreviewActive ? 0 : 1;
	const visibleCodeStep =
		visiblePreview?.kind === "code"
			? (codeSteps.get(visiblePreview.stepId) ?? null)
			: null;

	useEffect(() => {
		if (isIntroPreviewActive || !visibleCodeStep) {
			return;
		}

		const scrollContainer = scrollContainerRef.current;

		if (!scrollContainer) {
			return;
		}

		const focusLineIndex = visibleCodeStep.focusLineIndex ?? 0;
		const targetScrollTop = Math.max(
			0,
			focusLineIndex * CODE_LINE_HEIGHT_PX -
				scrollContainer.clientHeight * CODE_FOCUS_TOP_OFFSET_RATIO,
		);

		scrollContainer.scrollTo({
			top: targetScrollTop,
			behavior: selectedIndex <= 1 ? "auto" : "smooth",
		});
	}, [isIntroPreviewActive, selectedIndex, visibleCodeStep]);

	useEffect(() => {
		const previewRailElement = previewRailRef.current;

		if (!previewRailElement) {
			return;
		}

		const handleWheel = (event: WheelEvent) => {
			event.preventDefault();

			const scrollContainer = scrollContainerRef.current;

			if (!scrollContainer) {
				return;
			}

			scrollContainer.scrollTop += normalizeWheelDelta(
				event.deltaY,
				event.deltaMode,
				scrollContainer.clientHeight,
			);
			scrollContainer.scrollLeft += normalizeWheelDelta(
				event.deltaX,
				event.deltaMode,
				scrollContainer.clientWidth,
			);
		};

		previewRailElement.addEventListener("wheel", handleWheel, {
			passive: false,
		});

		return () => {
			previewRailElement.removeEventListener("wheel", handleWheel);
		};
	}, []);

	return (
		<div className="xl:sticky xl:top-10 xl:h-fit" ref={previewRailRef}>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-page-dim">
						{previewSwapProgress < 0.5 ? "Live preview" : "Live code"}
					</p>
					<p className="font-mono text-xs text-page-dim">
						{previewSwapProgress < 0.5
							? "di workflow"
							: visiblePreview?.kind === "code" && visibleCodeStep
								? visibleCodeStep.fileName
								: "preview"}
					</p>
				</div>

				<div className="relative min-h-[52svh] overflow-hidden md:min-h-[60svh] xl:min-h-[78svh]">
					{introPreview ? (
						<div
							className="absolute inset-0 transition-[transform,opacity] duration-200 ease-out"
							style={{
								opacity: 1 - previewSwapProgress * 0.12,
								transform: `translateY(${
									-previewSwapProgress * PREVIEW_LAYER_TRAVEL_PERCENT
								}%)`,
							}}
						>
							{renderPreview({
								descriptor: introPreview,
								scrollContainerRef,
							})}
						</div>
					) : null}

					{visiblePreview ? (
						<div
							className="absolute inset-0 transition-[transform,opacity] duration-200 ease-out"
							style={{
								opacity: previewSwapProgress,
								transform: `translateY(${
									(1 - previewSwapProgress) * PREVIEW_LAYER_TRAVEL_PERCENT
								}%)`,
							}}
						>
							{renderPreview({
								descriptor: visiblePreview,
								scrollContainerRef,
							})}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

function getVisibleTutorialPreview(
	steps: readonly TutorialStepData[],
	selectedIndex: number,
): TutorialPreviewDescriptor | null {
	const lastStepIndex = Math.min(Math.max(selectedIndex, 0), steps.length - 1);

	for (let stepIndex = lastStepIndex; stepIndex >= 0; stepIndex -= 1) {
		const preview = steps[stepIndex]?.preview ?? null;

		if (preview) {
			return preview;
		}
	}

	return null;
}

type RenderPreviewOptions = Readonly<{
	descriptor: TutorialPreviewDescriptor;
	scrollContainerRef: RefObject<HTMLDivElement | null>;
}>;

function renderPreview({
	descriptor,
	scrollContainerRef,
}: RenderPreviewOptions): ReactNode {
	if (descriptor.kind === "node") {
		return descriptor.node;
	}

	return (
		<ScrollyTutorialCodePreview
			scrollContainerRef={scrollContainerRef}
			stepId={descriptor.stepId}
		/>
	);
}

type ScrollyTutorialCodePreviewProps = Readonly<{
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	stepId: string;
}>;

function ScrollyTutorialCodePreview({
	scrollContainerRef,
	stepId,
}: ScrollyTutorialCodePreviewProps) {
	const codeStep = useScrollyTutorialCodeStep(stepId);

	return (
		<div
			className="relative max-h-[52svh] overflow-y-auto overflow-x-hidden pr-2 [overscroll-behavior:none] [scrollbar-color:var(--color-accent-border)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb:hover]:bg-[color-mix(in_oklab,var(--color-accent)_56%,var(--color-surface-panel-strong))] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_oklab,var(--color-accent)_42%,var(--color-surface-panel))] [&::-webkit-scrollbar-thumb]:bg-clip-padding-box [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-[10px] [&::-webkit-scrollbar]:w-[10px] md:max-h-[60svh] xl:max-h-[78svh]"
			ref={scrollContainerRef}
		>
			<div className="relative">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-0 z-0 rounded-md border border-accent/20 bg-accent-soft/70 transition-[top] duration-500 ease-out"
					style={{
						height: `${CODE_LINE_HEIGHT_PX}px`,
						top: `${(codeStep.focusLineIndex ?? 0) * CODE_LINE_HEIGHT_PX}px`,
					}}
				/>

				<div className="relative z-10">
					<Pre
						className="m-0 whitespace-pre-wrap text-[12px] leading-6 [overflow-wrap:anywhere] md:text-[13px]"
						code={codeStep.code}
						handlers={[CODEHIKE_TOKEN_TRANSITIONS]}
					/>
				</div>
			</div>
		</div>
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
		preview: TutorialPreviewDescriptor | null;
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
				id: tutorialNode.props.id ?? createScrollyTutorialStepId(stepTitle),
				preview: null,
				title: stepTitle,
			};
			continue;
		}

		if (!currentStep) {
			continue;
		}

		if (isCodeBlockNode(tutorialNode)) {
			assignCodePreviewToTutorialStep(currentStep);
			continue;
		}

		if (!currentStep.preview && isPreviewNode(tutorialNode)) {
			currentStep.preview = createPreviewDescriptor(tutorialNode);
			continue;
		}

		currentStep.contentNodes.push(tutorialNode);
	}

	if (currentStep) {
		tutorialSteps.push(currentStep);
	}

	return tutorialSteps;
}

function createPreviewDescriptor(
	node: ReactElement<WithChildrenProps>,
): TutorialPreviewDescriptor {
	return {
		kind: "node",
		node,
	};
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

	return typeof node.type !== "string";
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

function isIntrinsicElement<TProps extends { children?: ReactNode }>(
	node: ReactNode,
	tagName: string,
): node is ReactElement<TProps> {
	return isValidElement(node) && node.type === tagName;
}

function isCodeBlockNode(
	node: ReactNode,
): node is ReactElement<WithChildrenProps> {
	return isIntrinsicElement(node, "pre");
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

function normalizeWheelDelta(
	delta: number,
	deltaMode: number,
	containerSize: number,
): number {
	switch (deltaMode) {
		case 1:
			return delta * 16;
		case 2:
			return delta * containerSize;
		default:
			return delta;
	}
}

function assignCodePreviewToTutorialStep(step: {
	contentNodes: ReactNode[];
	id: string;
	preview: TutorialPreviewDescriptor | null;
	title: string;
}): void {
	if (step.preview?.kind === "code") {
		throw new Error(
			`Scrolly tutorial section "${step.title}" allows only one leading code block.`,
		);
	}

	if (step.preview || step.contentNodes.length > 0) {
		throw new Error(
			`Scrolly tutorial section "${step.title}" must place its code block immediately after the heading.`,
		);
	}

	step.preview = {
		kind: "code",
		stepId: createScrollyTutorialStepId(step.title),
	};
}
