/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-29 23:01:46
 */

import { MiddlewareManager } from "@/impls/MiddlewareManagerx";
import type {
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IMiddlewareManager } from "@/interfaces/middleware-chain.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import type { MutableRef } from "@/types/ref.type";

export const resolveRecordRef: MutableRef<IInternalResolveRecord> = {};

export const globalMiddlewares: IMiddlewareManager<
	ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
	// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
	any
> = new MiddlewareManager<
	ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
	// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
	any
>();
