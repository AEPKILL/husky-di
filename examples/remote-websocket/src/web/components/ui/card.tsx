/**
 * @overview Local shadcn/ui Card primitives for the RPC observatory.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import type { ComponentProps } from "react";

import { cn } from "@/web/utils/class-name.util";

export function Card({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"rounded-xl border border-border bg-card text-card-foreground shadow-sm",
				className,
			)}
			{...props}
		/>
	);
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("space-y-1.5 p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
	return (
		<h2 className={cn("font-semibold tracking-tight", className)} {...props} />
	);
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
	return (
		<p className={cn("text-sm text-muted-foreground", className)} {...props} />
	);
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("p-5 pt-0", className)} {...props} />;
}
