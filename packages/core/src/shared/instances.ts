/**
 * Shared global instances for the dependency injection system.
 *
 * @overview
 * Contains global instances that are shared across the entire application,
 * including the current resolution record reference and global middleware manager.
 * These instances enable cross-cutting concerns and resolution context tracking.
 *
 * @author AEPKILL
 * @created 2025-07-29 23:01:46
 */

import { MiddlewareManager } from "@/impls/MiddlewareManager";
import type {
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IMiddlewareManager } from "@/interfaces/middleware-chain.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import type { MutableRef } from "@/types/ref.type";

/**
 * Mutable reference to the current resolution record.
 *
 * @remarks
 * This reference is set during service resolution and allows the `resolve()`
 * utility function to access the current resolution context without
 * explicitly passing it as a parameter.
 */
export const resolveRecordRef: MutableRef<IInternalResolveRecord> = {};

/**
 * Global middleware manager for resolution middleware.
 *
 * @remarks
 * Middleware registered here will be applied to all service resolutions
 * across all containers. This enables global cross-cutting concerns such
 * as logging, performance monitoring, or validation.
 */
export const globalMiddleware: IMiddlewareManager<
	ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
	// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
	any
> = new MiddlewareManager<
	ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
	// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
	any
>();
