/**
 * @overview Homepage component that renders the dependency injection ASCII
 * workflow animation.
 * @author AEPKILL
 * @created 2026-06-30 10:24:50
 */

import { useMemo } from "react";
import { useAnimationTick } from "@/hooks/use-animation-tick";
import { getDiWorkflowAnimationFrame } from "@/utils/di-workflow-animation.utils";

const FRAME_INTERVAL_MS = 95;

export function DiWorkflowAnimation() {
	const tick = useAnimationTick({ intervalMs: FRAME_INTERVAL_MS });
	const frame = useMemo(() => getDiWorkflowAnimationFrame(tick), [tick]);

	return (
		<section
			aria-label="Dependency injection workflow animation"
			className="flex min-h-svh flex-col items-center justify-center gap-7 bg-term-bg p-6 font-mono text-term-fg"
		>
			<pre
				aria-hidden="true"
				className="text-terminal-glow select-none text-center text-[clamp(0.6rem,2.1vw,1.05rem)] leading-tight tracking-tight text-term-green"
			>
				{frame.ascii}
			</pre>

			<div className="flex flex-col items-center gap-1.5 text-center">
				<p className="text-sm uppercase tracking-[0.3em] text-term-amber md:text-base">
					{frame.label}
				</p>
				<p className="text-xs tracking-[0.4em] text-term-dim">
					DEPENDENCY INJECTION
				</p>
			</div>
		</section>
	);
}
