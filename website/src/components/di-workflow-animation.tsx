/**
 * @overview Homepage component that renders the dependency injection ASCII
 * workflow animation.
 * @author AEPKILL
 * @created 2026-06-30 10:24:50
 */

import { Link } from "@tanstack/react-router";
import { ASCII_LOGO, BRAND_SLOGAN } from "@/consts/brand.const";
import { useAnimationTick } from "@/hooks/use-animation-tick";
import { getDiWorkflowAnimationFrame } from "@/utils/di-workflow-animation.utils";

const FRAME_INTERVAL_MS = 95;

export function DiWorkflowAnimation() {
	const tick = useAnimationTick({ intervalMs: FRAME_INTERVAL_MS });
	const frame = getDiWorkflowAnimationFrame(tick);

	return (
		<section
			aria-label="Dependency injection workflow animation"
			className="flex min-h-svh flex-col items-center justify-center gap-8 bg-term-bg px-6 py-10 font-mono text-term-fg"
		>
			<div className="flex max-w-4xl flex-col items-center gap-4 text-center">
				<p className="text-[0.65rem] uppercase tracking-[0.4em] text-term-dim">
					terminal://husky-di/boot
				</p>
				<div className="w-full px-2">
					<pre
						aria-hidden="true"
						className="text-terminal-glow mx-auto w-max text-left text-[4px] leading-none text-term-green"
					>
						{ASCII_LOGO}
					</pre>
				</div>
				<div className="flex flex-col items-center gap-3">
					<h1 className="font-display text-4xl uppercase tracking-[0.22em] text-term-fg md:text-6xl">
						Husky DI
					</h1>
					<p className="max-w-2xl text-sm uppercase tracking-[0.18em] text-term-amber md:text-base">
						{BRAND_SLOGAN}
					</p>
				</div>
			</div>

			<div className="flex w-full max-w-4xl flex-col items-center gap-6 rounded-[1.75rem] border border-term-green/15 bg-black/15 px-5 py-6 shadow-[0_0_0_1px_rgba(0,230,118,0.05),0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-sm md:px-8">
				<pre
					aria-hidden="true"
					className="text-terminal-glow select-none text-center text-[clamp(0.6rem,2.1vw,1.05rem)] leading-tight tracking-tight text-term-green"
				>
					{frame.ascii}
				</pre>

				<div className="flex flex-col items-center gap-1.5 text-center">
					<p
						className={`text-sm uppercase tracking-[0.3em] text-term-amber md:text-base ${
							frame.isLabelVisible ? "opacity-100" : "opacity-0"
						}`}
					>
						{frame.label}
					</p>
					<p className="text-xs tracking-[0.4em] text-term-dim">
						DEPENDENCY INJECTION
					</p>
				</div>
			</div>

			<Link
				className="rounded-full border border-term-green/30 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-term-green transition hover:border-term-green/60 hover:bg-term-green/8"
				to="/codehike-demo"
			>
				Open Code Hike Demo
			</Link>
		</section>
	);
}
