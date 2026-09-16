/**
 * @overview Combines conditional shadcn class names and resolves Tailwind conflicts.
 * @author AEPKILL
 * @created 2026-07-01 17:06:52
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
