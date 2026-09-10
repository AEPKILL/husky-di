/**
 * @overview Combines conditional shadcn class names and resolves Tailwind conflicts.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
