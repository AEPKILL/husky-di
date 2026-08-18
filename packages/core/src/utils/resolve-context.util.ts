/**
 * Utility functions for managing the active resolution context.
 *
 * @overview
 * Stores resolution-scoped instances for the currently active resolution
 * chain and provides lifecycle helpers for container resolution.
 *
 * @author AEPKILL
 * @created 2026-08-18 22:25:00
 */

import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import type { ResolveContext } from "@/types/resolve-context.type";

const resolveContexts = new WeakMap<IInternalResolveRecord, ResolveContext>();

/**
 * Gets the resolution context associated with a resolve record.
 *
 * @param resolveRecord - The resolution chain record
 * @returns The associated resolution context, if one exists
 */
export function getResolveContext(
	resolveRecord: IInternalResolveRecord,
): ResolveContext | undefined {
	return resolveContexts.get(resolveRecord);
}

/**
 * Gets the resolution context for a resolve record, creating it when needed.
 *
 * @param resolveRecord - The resolution chain record
 * @returns The associated resolution context
 */
export function getEnsureResolveContext(
	resolveRecord: IInternalResolveRecord,
): ResolveContext {
	let resolveContext = getResolveContext(resolveRecord);
	if (!resolveContext) {
		resolveContext = new Map();
		resolveContexts.set(resolveRecord, resolveContext);
	}
	return resolveContext;
}

/**
 * Associates a resolution context with a resolve record.
 *
 * @param resolveRecord - The resolution chain record
 * @param context - The resolution context to activate
 */
export function setResolveContext(
	resolveRecord: IInternalResolveRecord,
	context: ResolveContext,
): void {
	resolveContexts.set(resolveRecord, context);
}

/**
 * Clears the resolution context associated with a resolve record.
 *
 * @param resolveRecord - The resolution chain record
 */
export function resetResolveContext(
	resolveRecord: IInternalResolveRecord,
): void {
	resolveContexts.delete(resolveRecord);
}
