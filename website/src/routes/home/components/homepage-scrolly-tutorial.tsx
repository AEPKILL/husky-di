/**
 * @overview Homepage scrollytelling tutorial with a fixed Code Hike preview
 * rail and scroll-driven code transitions.
 * @author AEPKILL
 * @created 2026-07-02 14:35:00
 */

import { Pre } from "codehike/code";
import {
	Selectable,
	SelectionProvider,
	useSelectedIndex,
} from "codehike/utils/selection";
import { useEffect, useRef } from "react";
import { CODEHIKE_TOKEN_TRANSITIONS } from "@/components/codehike-token-transitions";
import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";

export type HomepageScrollyTutorialProps = Readonly<{
	steps: readonly CodehikeScrollyDemoStep[];
}>;

const CODE_LINE_HEIGHT_PX = 24;
const CODE_FOCUS_TOP_OFFSET_RATIO = 0.24;

export function HomepageScrollyTutorial({
	steps,
}: HomepageScrollyTutorialProps) {
	return (
		<section
			className="border-y border-border bg-page-bg text-page-fg"
			id="homepage-tutorial"
		>
			<div className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-18 xl:py-24">
				<SelectionProvider
					className="grid gap-10 xl:grid-cols-[minmax(0,1.08fr)_minmax(23rem,28rem)] xl:gap-16"
					rootMargin={{ top: 180, height: 240 }}
				>
					<HomepageScrollyTutorialCodePanel steps={steps} />

					<div className="max-xl:pb-4 xl:relative xl:pl-8 xl:before:absolute xl:before:bottom-0 xl:before:left-[-2rem] xl:before:top-0 xl:before:border-l xl:before:border-dashed xl:before:border-border-strong">
						<div className="space-y-0">
							{steps.map((step, index) => (
								<Selectable
									key={step.id}
									className="py-10 first:pt-0 last:pb-[26svh] xl:min-h-[38svh] xl:py-14 data-[selected=true]:[&_article_h3]:text-page-fg data-[selected=true]:[&_article_p]:text-page-soft"
									index={index}
									selectOn={["scroll"]}
								>
									<article className="w-full max-w-[30rem] space-y-5">
										<h3 className="text-[1.6rem] leading-tight font-black tracking-[-0.03em] text-page-subtle transition md:text-[1.9rem]">
											{step.title}
										</h3>
										<p className="text-[15px] leading-8 text-page-muted transition">
											{step.summary}
										</p>
										<div className="space-y-4 text-[15px] leading-8 text-page-muted transition">
											{step.details.map((detail) => (
												<p key={detail}>{detail}</p>
											))}
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

type HomepageScrollyTutorialCodePanelProps = Readonly<{
	steps: readonly CodehikeScrollyDemoStep[];
}>;

function HomepageScrollyTutorialCodePanel({
	steps,
}: HomepageScrollyTutorialCodePanelProps) {
	const [selectedIndex] = useSelectedIndex();
	const activeStep = steps[selectedIndex] ?? steps[0];
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const scrollContainer = scrollContainerRef.current;

		if (!scrollContainer) {
			return;
		}

		const focusLineIndex = activeStep.focusLineIndex ?? 0;
		const targetScrollTop = Math.max(
			0,
			focusLineIndex * CODE_LINE_HEIGHT_PX -
				scrollContainer.clientHeight * CODE_FOCUS_TOP_OFFSET_RATIO,
		);

		scrollContainer.scrollTo({
			top: targetScrollTop,
			behavior: selectedIndex === 0 ? "auto" : "smooth",
		});
	}, [activeStep.focusLineIndex, selectedIndex]);

	return (
		<div className="xl:sticky xl:top-10 xl:h-fit">
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-page-dim">
						Live code
					</p>
					<p className="font-mono text-xs text-page-dim">
						{activeStep.fileName}
					</p>
				</div>

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
								top: `${(activeStep.focusLineIndex ?? 0) * CODE_LINE_HEIGHT_PX}px`,
							}}
						/>

						<div className="relative z-10">
							<Pre
								className="m-0 whitespace-pre-wrap text-[12px] leading-6 [overflow-wrap:anywhere] md:text-[13px]"
								code={activeStep.code}
								handlers={[CODEHIKE_TOKEN_TRANSITIONS]}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
