/**
 * @overview Carries the Lab application trace across local async work and RPC interception.
 * @author AEPKILL
 * @created 2026-09-12 12:07:25
 */

export interface ILabTraceContext {
	get(): string | undefined;
	run<T>(traceId: string, operation: () => T): T;
}
