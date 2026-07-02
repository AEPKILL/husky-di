/**
 * @overview MDX-driven homepage scrollytelling layout with a single fixed left
 * preview rail and right-side narrative sections.
 * @author AEPKILL
 * @created 2026-07-02 18:20:00
 */

import { Pre } from "codehike/code";
import {
	Selectable,
	SelectionProvider,
	useSelectedIndex,
} from "codehike/utils/selection";
import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { CODEHIKE_TOKEN_TRANSITIONS } from "@/components/codehike-token-transitions";
import {
	HomepageTutorialCodeMarker,
	type HomepageTutorialCodeMarkerProps,
} from "./homepage-tutorial-code-marker";
import {
	useHomepageTutorialCodeStep,
	useHomepageTutorialCodeStepsMap,
} from "./homepage-tutorial-code-steps.context";

const CODE_LINE_HEIGHT_PX = 24;
const CODE_FOCUS_TOP_OFFSET_RATIO = 0.24;
const INTRO_PREVIEW_TRANSITION_START_RATIO = 0.84;
const INTRO_PREVIEW_TRANSITION_END_RATIO = 0.34;
const INTRO_PREVIEW_SWAP_START = 0.56;
const INTRO_PREVIEW_SWAP_END = 0.92;
const PREVIEW_LAYER_TRAVEL_PERCENT = 104;

export type HomepageMdxScrollyTutorialProps = Readonly<{
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

export function HomepageMdxScrollyTutorial({
	children,
	id,
}: HomepageMdxScrollyTutorialProps) {
	const tutorialSteps = createTutorialSteps(children);
	const stepArticleRefs = useRef<Array<HTMLElement | null>>([]);
	const [introTransitionProgress, setIntroTransitionProgress] = useState(0);

	useEffect(() => {
		const updateProgress = () => {
			const secondStepElement = stepArticleRefs.current[1];

			if (!secondStepElement) {
				setIntroTransitionProgress(0);
				return;
			}

			const secondStepTop = secondStepElement.getBoundingClientRect().top;
			const startY = window.innerHeight * INTRO_PREVIEW_TRANSITION_START_RATIO;
			const endY = window.innerHeight * INTRO_PREVIEW_TRANSITION_END_RATIO;
			const progress = (startY - secondStepTop) / (startY - endY);

			setIntroTransitionProgress(clampHomepagePreviewProgress(progress));
		};

		updateProgress();

		let animationFrameId = 0;

		const scheduleProgressUpdate = () => {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = requestAnimationFrame(updateProgress);
		};

		window.addEventListener("resize", scheduleProgressUpdate);
		window.addEventListener("scroll", scheduleProgressUpdate, {
			passive: true,
		});

		return () => {
			cancelAnimationFrame(animationFrameId);
			window.removeEventListener("resize", scheduleProgressUpdate);
			window.removeEventListener("scroll", scheduleProgressUpdate);
		};
	}, []);

	return (
		<section className="border-y border-border bg-page-bg text-page-fg" id={id}>
			<div className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-18 xl:py-24">
				<SelectionProvider
					className="grid gap-10 xl:grid-cols-[minmax(0,1.08fr)_minmax(23rem,28rem)] xl:gap-16"
					rootMargin={{ top: 180, height: 240 }}
				>
					<HomepageMdxScrollyTutorialPreviewRail
						introTransitionProgress={introTransitionProgress}
						steps={tutorialSteps}
					/>

					<div className="max-xl:pb-4 xl:relative xl:pl-8 xl:before:absolute xl:before:bottom-0 xl:before:left-[-2rem] xl:before:top-0 xl:before:border-l xl:before:border-dashed xl:before:border-border-strong">
						<div className="space-y-0">
							{tutorialSteps.map((step, index) => (
								<Selectable
									key={step.id}
									className="py-10 first:pt-0 last:pb-[26svh] xl:min-h-[38svh] xl:py-14 data-[selected=true]:[&_article_h3]:text-page-fg data-[selected=true]:[&_article_p]:text-page-soft"
									index={index}
									selectOn={["scroll"]}
								>
									<article
										className="w-full max-w-[30rem] space-y-5"
										ref={(element) => {
											stepArticleRefs.current[index] = element;
										}}
									>
										<h3 className="text-[1.6rem] leading-tight font-black tracking-[-0.03em] text-page-subtle transition md:text-[1.9rem]">
											{step.title}
										</h3>
										<div className="space-y-4 text-[15px] leading-8 text-page-muted transition [&_a]:text-accent [&_code]:rounded-sm [&_code]:bg-black/30 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-code-symbol [&_li]:ml-6 [&_li]:list-disc [&_li]:text-[15px] [&_li]:leading-8 [&_strong]:font-semibold [&_ul]:space-y-2">
											{step.contentNodes}
										</div>
									</article>
								</Selectable>
							))}
						</div>
					</div>
				</SelectionProvider>
			</div>
		</section>
	);
}

type HomepageMdxScrollyTutorialPreviewRailProps = Readonly<{
	introTransitionProgress: number;
	steps: readonly TutorialStepData[];
}>;

function HomepageMdxScrollyTutorialPreviewRail({
	introTransitionProgress,
	steps,
}: HomepageMdxScrollyTutorialPreviewRailProps) {
	const [selectedIndex] = useSelectedIndex();
	const codeSteps = useHomepageTutorialCodeStepsMap();
	const activeStep = steps[selectedIndex] ?? steps[0];
	const previewRailRef = useRef<HTMLDivElement | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const isIntroPreviewActive = introTransitionProgress < 1;
	const introPreview = steps[0]?.preview ?? null;
	const secondPreview = steps[1]?.preview ?? null;
	const visiblePreview =
		selectedIndex === 0 && secondPreview
			? secondPreview
			: (activeStep?.preview ?? null);
	const previewSwapProgress = getIntroPreviewSwapProgress(
		introTransitionProgress,
	);
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
							{renderHomepagePreview({
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
							{renderHomepagePreview({
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

type RenderHomepagePreviewOptions = Readonly<{
	descriptor: TutorialPreviewDescriptor;
	scrollContainerRef: RefObject<HTMLDivElement | null>;
}>;

function renderHomepagePreview({
	descriptor,
	scrollContainerRef,
}: RenderHomepagePreviewOptions): ReactNode {
	if (descriptor.kind === "node") {
		return descriptor.node;
	}

	return (
		<HomepageTutorialCodePreview
			scrollContainerRef={scrollContainerRef}
			stepId={descriptor.stepId}
		/>
	);
}

type HomepageTutorialCodePreviewProps = Readonly<{
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	stepId: string;
}>;

function HomepageTutorialCodePreview({
	scrollContainerRef,
	stepId,
}: HomepageTutorialCodePreviewProps) {
	const codeStep = useHomepageTutorialCodeStep(stepId);

	return (
		<div
			className="homepage-code-scroll relative max-h-[52svh] overflow-y-auto overflow-x-hidden pr-2 md:max-h-[60svh] xl:max-h-[78svh]"
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
				id: tutorialNode.props.id ?? createSlug(stepTitle),
				preview: null,
				title: stepTitle,
			};
			continue;
		}

		if (!currentStep) {
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
	node: ReactElement<WithChildrenProps & HomepageTutorialCodeMarkerProps>,
): TutorialPreviewDescriptor {
	if (node.type === HomepageTutorialCodeMarker) {
		return {
			kind: "code",
			stepId: node.props.stepId,
		};
	}

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
): node is ReactElement<WithChildrenProps & HomepageTutorialCodeMarkerProps> {
	if (!isValidElement(node)) {
		return false;
	}

	if (node.type === HomepageTutorialCodeMarker) {
		return true;
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

function clampHomepagePreviewProgress(value: number): number {
	return Math.min(1, Math.max(0, value));
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

function getIntroPreviewSwapProgress(progress: number): number {
	const normalizedProgress =
		(progress - INTRO_PREVIEW_SWAP_START) /
		(INTRO_PREVIEW_SWAP_END - INTRO_PREVIEW_SWAP_START);

	return easeHomepagePreviewProgress(
		clampHomepagePreviewProgress(normalizedProgress),
	);
}

function easeHomepagePreviewProgress(progress: number): number {
	return progress * progress * (3 - 2 * progress);
}
