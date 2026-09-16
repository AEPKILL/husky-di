/**
 * @overview Creates the Lab interceptor that maps application trace context to Call Metadata.
 * @author AEPKILL
 * @created 2026-09-12 12:07:25
 */

import { RpcCallDirectionEnum, type RpcInterceptor } from "@husky-di/remote";
import { Observable } from "rxjs";
import type { ILabTraceContext } from "@/interfaces/lab-trace-context.interface";

export function createLabTraceInterceptor(
	traceContext: ILabTraceContext,
): RpcInterceptor {
	return (context, next) => {
		if (context.direction === RpcCallDirectionEnum.outgoing) {
			const traceId = traceContext.get();
			if (traceId !== undefined)
				context.metadata = { ...context.metadata, traceId };
			return next();
		}
		const traceId = context.metadata.traceId;
		return typeof traceId === "string"
			? new Observable((subscriber) =>
					traceContext.run(traceId, () => next().subscribe(subscriber)),
				)
			: next();
	};
}
