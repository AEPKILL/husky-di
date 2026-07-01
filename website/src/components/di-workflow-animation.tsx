/**
 * @overview Shared component that renders the dependency injection ASCII
 * workflow animation.
 * @author AEPKILL
 * @created 2026-06-30 10:24:50
 */

import { useAnimationTick } from "@/hooks/use-animation-tick";
import { cn } from "@/utils/class-name.util";
import { getDiWorkflowAnimationFrame } from "@/utils/di-workflow-animation.utils";

const FRAME_INTERVAL_MS = 95;

export type DiWorkflowAnimationProps = Readonly<{
	className?: string;
}>;

export function DiWorkflowAnimation({ className }: DiWorkflowAnimationProps) {
	const tick = useAnimationTick({ intervalMs: FRAME_INTERVAL_MS });
	const frame = getDiWorkflowAnimationFrame(tick);

	return (
		<section
			aria-label="Dependency injection workflow animation"
			className={cn(
				"flex min-h-svh flex-col items-center justify-center gap-8 bg-term-bg px-6 py-10 font-mono text-term-fg",
				className,
			)}
		>
			<div className="flex w-full max-w-4xl flex-col items-center gap-6 rounded-[1.75rem] border border-term-green/15 bg-black/15 px-5 py-6 shadow-[0_0_0_1px_rgba(0,230,118,0.05),0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur-sm md:px-8">
				<pre
					aria-hidden="true"
					className="text-terminal-glow select-none text-center text-[clamp(0.6rem,2.1vw,1.05rem)] leading-tight tracking-tight text-term-green"
				>
					{frame.ascii}
				</pre>

				<div className="flex flex-col items-center gap-1.5 text-center">
					<p
						className={cn(
							"text-sm uppercase tracking-[0.3em] text-term-amber md:text-base",
							frame.isLabelVisible ? "opacity-100" : "opacity-0",
						)}
					>
						{frame.label}
					</p>
					<p className="text-xs tracking-[0.4em] text-term-dim">
						DEPENDENCY INJECTION
					</p>
				</div>
			</div>
		</section>
	);
}
