/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 22:53:06
 */

import type {
	ResolveMiddleware,
	ResolveOptions,
} from "@/interfaces/container.interface";
import { globalMiddleware } from "@/shared/instances";

export function useGlobalMiddleware(
	middleware: ResolveMiddleware<unknown, ResolveOptions<unknown>>,
): void {
	globalMiddleware.use(middleware);
}

export function unusedGlobalMiddleware(
	middleware: ResolveMiddleware<unknown, ResolveOptions<unknown>>,
): void {
	globalMiddleware.unused(middleware);
}
