/**
 * @overview Local shadcn/ui Input primitive for RPC arguments.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import type { ComponentProps } from "react";

import { cn } from "@/web/utils/class-name.util";

export function Input({ className, ...props }: ComponentProps<"input">) {
	return (
		<input
			className={cn(
				"h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
