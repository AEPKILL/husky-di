/**
 * @overview Provides the synchronous trace context needed by the browser Lab owner.
 * @author AEPKILL
 * @created 2026-09-12 12:07:25
 */

import type { ILabTraceContext } from "@/interfaces/lab-trace-context.interface";

export function createLabTraceContext(): ILabTraceContext {
	let current: string | undefined;
	return {
		get: () => current,
		run(traceId, operation) {
			const previous = current;
			current = traceId;
			try {
				return operation();
			} finally {
				current = previous;
			}
		},
	};
}
