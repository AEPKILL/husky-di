/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 22:53:06
 */

import type {
	ResolveMiddleware,
	ResolveOptions,
} from "@/interfaces/container.interface";
import { globalMiddlewares } from "@/shared/instances";

export function useGlobalMiddleware(
	middleware: ResolveMiddleware<unknown, ResolveOptions<unknown>>,
): void {
	globalMiddlewares.use(middleware);
}

export function unusedGlobalMiddleware(
	middleware: ResolveMiddleware<unknown, ResolveOptions<unknown>>,
): void {
	globalMiddlewares.unused(middleware);
}
