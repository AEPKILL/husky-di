/**
 * @overview Shared class name helper for the Husky DI website UI layer.
 * @author Codex
 * @created 2026-06-25 21:40:00
 */

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Parameters<typeof clsx>) {
	return twMerge(clsx(inputs));
}
