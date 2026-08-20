/**
 * @overview Merges conditional class names for Web shadcn/ui components.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
