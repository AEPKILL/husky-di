/**
 * @overview Shared class name merge helper for website components.
 * @author AEPKILL
 * @created 2026-07-01 17:28:00
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
