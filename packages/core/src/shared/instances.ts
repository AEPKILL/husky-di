/**
 * Shared module instances for the dependency injection system.
 *
 * @overview
 * Contains state shared by containers created through this loaded package
 * module instance, including the current resolution record reference and
 * middleware manager.
 *
 * @author AEPKILL
 * @created 2025-07-29 23:01:46
 */

import { MiddlewareManagerImpl } from "@/impls/middleware-manager.impl";
import type {
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IMiddlewareManager } from "@/interfaces/middleware.interface";
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
 * Module-instance middleware manager for resolution middleware.
 *
 * @remarks
 * Middleware registered here applies to service resolutions across containers
 * created by this package module instance.
 */
export const middlewareManager: ResolveMiddlewareManagerImpl =
	new MiddlewareManagerImpl();

export const middleware: ResolveMiddlewareManager = {
	use: (...middlewares) => middlewareManager.use(...middlewares),
};

type ResolveMiddlewareManager = IMiddlewareManager<
	ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
	// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
	any
>;

type ResolveMiddlewareManagerImpl = MiddlewareManagerImpl<
	ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
	// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
	any
>;
