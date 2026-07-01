/**
 * @overview Shared preview shell for MDX-authored tutorial steps.
 * @author AEPKILL
 * @created 2026-07-01 19:25:00
 */

import type { ReactNode } from "react";
import { cn } from "@/utils/class-name.util";

export type TutorialPreviewFrameProps = Readonly<{
	badge?: string;
	bodyClassName?: string;
	children: ReactNode;
	className?: string;
	eyebrow?: string;
	title: string;
}>;

export function TutorialPreviewFrame({
	badge,
	bodyClassName = "",
	children,
	className = "",
	eyebrow = "Preview",
	title,
}: TutorialPreviewFrameProps) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-[1.75rem] border border-white/8 bg-[#0b0f14] shadow-[0_30px_90px_rgba(0,0,0,0.32)]",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-3">
				<div className="min-w-0">
					<p className="font-mono text-[0.65rem] uppercase tracking-[0.24em] text-slate-500">
						{eyebrow}
					</p>
					<p className="mt-1 truncate text-sm font-semibold text-slate-100">
						{title}
					</p>
				</div>

				{badge ? (
					<div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.22em] text-slate-300">
						{badge}
					</div>
				) : null}
			</div>

			<div className={cn("p-4", bodyClassName)}>{children}</div>
		</div>
	);
}
