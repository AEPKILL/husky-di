/**
 * @overview Code Hike based scrollycoding demo for the website workspace.
 * @author AEPKILL
 * @created 2026-06-30 11:38:00
 */

import { Pre } from "codehike/code";
import {
	Selectable,
	SelectionProvider,
	useSelectedIndex,
} from "codehike/utils/selection";
import { CODEHIKE_TOKEN_TRANSITIONS } from "@/components/codehike-token-transitions";
import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";

type CodehikeScrollyDemoProps = Readonly<{
	steps: readonly CodehikeScrollyDemoStep[];
}>;

export function CodehikeScrollyDemo({ steps }: CodehikeScrollyDemoProps) {
	return (
		<section className="min-h-svh bg-[#0f1319] text-page-fg">
			<div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-10 lg:px-10 lg:py-14">
				<header className="max-w-3xl">
					<p className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-term-green">
						Layout / Scrollycoding
					</p>
					<h1
						className="mt-4 text-4xl leading-none font-black tracking-[-0.04em] text-white md:text-5xl"
						style={{ fontFamily: "var(--font-display)" }}
					>
						Scrollycoding for Husky DI
					</h1>
					<p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
						A layout combining a scrollytelling effect with code blocks. Scroll
						the explanation on the right and the sticky code panel on the left
						will switch frames the same way Code Hike&apos;s docs demo does.
					</p>
				</header>

				<SelectionProvider
					className="mt-12 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]"
					rootMargin={{ top: 180, height: 240 }}
				>
					<CodePanel steps={steps} />
					<div className="relative max-xl:pb-8">
						<div className="absolute bottom-0 left-4 top-0 hidden w-px bg-white/10 xl:block" />
						<div className="space-y-0">
							{steps.map((step, index) => (
								<Selectable
									key={step.id}
									className="relative flex min-h-[420px] items-center py-4 data-[selected=true]:[&_article_.step-card]:border-white/12 data-[selected=true]:[&_article_.step-card]:bg-white/[0.05] data-[selected=true]:[&_article_.step-dot]:border-term-green/50 data-[selected=true]:[&_article_.step-dot]:bg-term-green xl:min-h-[440px]"
									index={index}
									selectOn={["scroll", "hover", "click"]}
								>
									<article className="relative w-full pl-10">
										<div className="step-dot absolute left-[9px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white/18 bg-[#0f1319] transition" />
										<div className="step-card rounded-3xl border border-white/6 bg-white/[0.03] px-6 py-7 transition duration-200 ease-out md:px-7">
											<p className="font-mono text-[0.68rem] uppercase tracking-[0.26em] text-term-amber">
												{step.eyebrow}
											</p>
											<h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white md:text-[2rem]">
												{step.title}
											</h2>
											<p className="mt-4 text-[15px] leading-8 text-slate-300">
												{step.summary}
											</p>
											<div className="mt-5 space-y-4 text-[15px] leading-8 text-slate-400">
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

type CodePanelProps = Readonly<{
	steps: readonly CodehikeScrollyDemoStep[];
}>;

function CodePanel({ steps }: CodePanelProps) {
	const [selectedIndex] = useSelectedIndex();
	const activeStep = steps[selectedIndex] ?? steps[0];

	return (
		<div className="xl:sticky xl:top-10 xl:h-fit">
			<div className="overflow-hidden rounded-[1.75rem] border border-white/8 bg-[#0b0f14] shadow-[0_30px_90px_rgba(0,0,0,0.32)]">
				<div className="flex items-center justify-between border-b border-white/8 px-5 py-3">
					<div>
						<p className="font-mono text-[0.65rem] uppercase tracking-[0.24em] text-slate-500">
							Preview
						</p>
						<p className="mt-1 text-sm font-semibold text-slate-100">
							{activeStep.title}
						</p>
					</div>
					<div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-slate-300">
						app.ts
					</div>
				</div>
				<div className="p-3">
					<div className="max-h-[44vh] overflow-auto md:max-h-[56vh] xl:max-h-[70vh]">
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
