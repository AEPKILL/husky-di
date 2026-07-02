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
import { CODEHIKE_TOKEN_TRANSITIONS } from "@/components/codehike-token-transitions";
import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";

export type HomepageScrollyTutorialProps = Readonly<{
	steps: readonly CodehikeScrollyDemoStep[];
}>;

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
					className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] xl:gap-12"
					rootMargin={{ top: 180, height: 240 }}
				>
					<HomepageScrollyTutorialCodePanel steps={steps} />

					<div className="relative max-xl:pb-4">
						<div className="absolute bottom-0 left-4 top-0 hidden w-px bg-border-soft xl:block" />
						<div className="space-y-0">
							{steps.map((step, index) => (
								<Selectable
									key={step.id}
									className="relative flex min-h-[78svh] items-center py-6 data-[selected=true]:[&_article_.homepage-step-card]:border-border-strong data-[selected=true]:[&_article_.homepage-step-card]:bg-surface-glass-strong data-[selected=true]:[&_article_.homepage-step-dot]:border-accent-border data-[selected=true]:[&_article_.homepage-step-dot]:bg-accent"
									index={index}
									selectOn={["scroll", "hover", "click"]}
								>
									<article className="relative w-full pl-10">
										<div className="homepage-step-dot absolute left-[9px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-border-strong bg-page-bg transition" />
										<div className="homepage-step-card rounded-[1.9rem] border border-border-soft bg-surface-glass px-6 py-7 transition duration-200 ease-out md:px-7 md:py-8">
											<p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-term-green">
												{step.eyebrow}
											</p>
											<h2 className="mt-3 text-[2rem] leading-none font-black tracking-[-0.04em] text-page-fg md:text-[2.35rem]">
												{step.title}
											</h2>
											<p className="mt-5 text-[15px] leading-8 text-page-soft">
												{step.summary}
											</p>
											<div className="mt-5 space-y-4 text-[15px] leading-8 text-page-muted">
												{step.details.map((detail) => (
													<p key={detail}>{detail}</p>
												))}
											</div>
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

	return (
		<div className="xl:sticky xl:top-10 xl:h-fit">
			<div className="overflow-hidden rounded-[1.9rem] border border-border-soft bg-surface-deep shadow-[0_30px_90px_rgba(0,0,0,0.32)]">
				<div className="flex items-center justify-between border-b border-border-soft px-5 py-3">
					<div>
						<p className="font-mono text-[0.65rem] uppercase tracking-[0.24em] text-page-dim">
							Live Preview
						</p>
						<p className="mt-1 text-sm font-semibold text-page-soft">
							{activeStep.title}
						</p>
					</div>
					<div className="rounded-full border border-border-strong bg-surface-glass-strong px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-page-subtle">
						{activeStep.fileName}
					</div>
				</div>
				<div className="p-3">
					<div className="max-h-[52svh] overflow-auto md:max-h-[60svh] xl:max-h-[78svh]">
						<Pre
							className="m-0 text-[12px] leading-6 md:text-[13px]"
							code={activeStep.code}
							handlers={[CODEHIKE_TOKEN_TRANSITIONS]}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
