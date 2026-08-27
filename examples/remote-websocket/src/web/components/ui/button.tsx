/**
 * @overview Local shadcn/ui Button primitive for RPC controls.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/web/utils/class-name.util";

export function Button({
	className,
	variant,
	...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
	return (
		<button className={cn(buttonVariants({ variant }), className)} {...props} />
	);
}

const buttonVariants = cva(
	"inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90",
				outline: "border border-border bg-background hover:bg-accent",
			},
		},
		defaultVariants: { variant: "default" },
	},
);
