/**
 * @overview Local shadcn/ui Badge primitive for RPC state labels.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/web/utils/class-name.util";

export function Badge({
	className,
	variant,
	...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return (
		<span className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

const badgeVariants = cva(
	"inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.12em]",
	{
		variants: {
			variant: {
				default: "border-primary/30 bg-primary/12 text-primary",
				muted: "border-border bg-muted text-muted-foreground",
				warning: "border-warning/30 bg-warning/10 text-warning",
				danger: "border-destructive/30 bg-destructive/10 text-destructive",
			},
		},
		defaultVariants: { variant: "default" },
	},
);
