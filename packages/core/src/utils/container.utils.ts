/**
 * Utility function for resolving services within a resolution context.
 *
 * @overview
 * Provides a convenient way to resolve services from within factory functions,
 * decorators, or other contexts where direct container access is not available.
 * This function uses the current resolution record to access the active container.
 *
 * @author AEPKILL
 * @created 2025-07-30 22:53:06
 */

import { ResolveException } from "@/exceptions/resolve.exception";
import type {
	IContainer,
	ResolveInstance,
	ResolveOptions,
} from "@/interfaces/container.interface";
import { resolveRecordRef } from "@/shared/instances";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

function _resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;
function _resolve<T, Options extends ResolveOptions<T>>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: Options,
): ResolveInstance<T, Options>;
/**
 * Resolves a service from the current resolution context.
 *
 * @remarks
 * This function can only be called within an active resolution context
 * (i.e., during service resolution). It uses the current resolution record
 * to access the active container and resolve the service.
 *
 * @typeParam T - The type of service to resolve
 * @typeParam Options - The resolve options type
 *
 * @param serviceIdentifier - The service identifier to resolve
 * @param options - Optional resolve options
 * @returns The resolved service instance
 *
 * @throws {Error} If called outside of a resolution context
 * @throws {ResolveException} If no container is available in the resolution context
 *
 * @example
 * ```typescript
 * // Inside a factory function
 * const factory = () => {
 *   const dependency = resolve(MyDependency);
 *   return new MyService(dependency);
 * };
 * ```
 */
function _resolve<T, Options extends ResolveOptions<T>>(
	serviceIdentifier: ServiceIdentifier<T>,
	options?: Options,
): ResolveInstance<T, Options> {
	const resolveRecord = resolveRecordRef.current;

	if (!resolveRecord) {
		throw new Error(
			`The "resolve" method can only be called within a resolve context. This typically happens when trying to resolve a service outside of a container's resolve process.`,
		);
	}

	const currentContainer = resolveRecord.getCurrentContainer();

	if (currentContainer) {
		return currentContainer.resolve(
			serviceIdentifier,
			options as Options,
		) as ResolveInstance<T, Options>;
	}

	throw new ResolveException(
		`No container available in the current resolve context. This usually indicates that the resolve context has been corrupted or improperly initialized.`,
		resolveRecord,
	);
}

/**
 * Resolve utility function that works within resolution contexts.
 *
 * @remarks
 * This is a convenience function that allows resolving services from within
 * factory functions, decorators, or other contexts without direct container access.
 * It must be called within an active resolution context.
 */
export const resolve: IContainer["resolve"] = _resolve;
