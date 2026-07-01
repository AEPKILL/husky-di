/**
 * @overview Shared terminal-style code container component for the website.
 * @author AEPKILL
 * @created 2026-07-01 17:18:00
 */

import type { ReactNode } from "react";
import { cn } from "@/utils/class-name.util";

export type CodeContainerProps = Readonly<{
	actions?: ReactNode;
	bodyClassName?: string;
	children: ReactNode;
	className?: string;
	fileName: string;
	iconName?: string;
}>;

export function CodeContainer({
	actions,
	bodyClassName = "",
	children,
	className = "",
	fileName,
	iconName = "description",
}: CodeContainerProps) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border border-[#3b4a3d] bg-[#0b0f12] shadow-2xl",
				className,
			)}
		>
			<div className="flex items-center justify-between border-b border-[#3b4a3d] bg-[#272a2e] px-4 py-2">
				<div className="flex items-center gap-2">
					<span
						aria-hidden="true"
						className='inline-block [direction:ltr] font-["Material_Symbols_Outlined",sans-serif] text-sm leading-none font-normal tracking-normal whitespace-nowrap normal-case not-italic [font-variation-settings:"FILL"_0,"wght"_400,"GRAD"_0,"opsz"_24] [word-wrap:normal] antialiased text-[#bacbb9]'
					>
						{iconName}
					</span>
					<span className="font-mono text-xs text-[#bacbb9]">{fileName}</span>
				</div>

				{actions ? <div>{actions}</div> : null}
			</div>

			<div className={cn(bodyClassName)}>{children}</div>
		</div>
	);
}
