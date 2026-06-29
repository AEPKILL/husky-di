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

import { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { ResolveContainerScopeEnum } from "@/enums/resolve-container-scope.enum";
import { CoreException } from "@/exceptions/core.exception";
import { ResolveException } from "@/exceptions/resolve.exception";
import {
	IContainer,
	type ResolveInstance,
	type ResolveOptions,
} from "@/interfaces/container.interface";
import { resolveRecordRef } from "@/shared/instances";
import type { Ref } from "@/types/ref.type";
import type { ResolveHelperOptions } from "@/types/resolve-helper-options.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export function resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;
export function resolve<T, Options extends ResolveHelperOptions<T>>(
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
export function resolve<T, Options extends ResolveHelperOptions<T>>(
	serviceIdentifier: ServiceIdentifier<T>,
	options?: Options,
): ResolveInstance<T, Options> {
	const resolveRecord = resolveRecordRef.current;

	if (!resolveRecord) {
		throw new CoreException(
			CoreErrorCodeEnum.E_RESOLVE_CONTEXT_UNAVAILABLE,
			`The "resolve" method can only be called within a resolve context. This typically happens when trying to resolve a service outside of a container's resolve process.`,
		);
	}

	const scope = options?.scope ?? ResolveContainerScopeEnum.current;
	const container =
		scope === ResolveContainerScopeEnum.origin
			? resolveRecord.getOriginContainer()
			: resolveRecord.getCurrentContainer();

	if (!container) {
		throw new ResolveException(
			CoreErrorCodeEnum.E_RESOLVE_CONTEXT_UNAVAILABLE,
			`No container available in the current resolve context. This usually indicates that the resolve context has been corrupted or improperly initialized.`,
			resolveRecord,
		);
	}

	// Treat `IContainer` as sugar for retrieving the current active container.
	// Keeping this behavior in `resolve` avoids polluting other container
	// registries with an extra registration just to model that active-container
	// lookup semantics.
	if (serviceIdentifier === IContainer) {
		const multiple = options?.multiple;
		const useRef = options?.dynamic || options?.ref;
		const containerResult = multiple ? [container] : container;

		if (useRef) {
			return {
				resolved: true,
				current: containerResult as T,
			} satisfies Ref<T> as ResolveInstance<T, Options>;
		}

		return containerResult as ResolveInstance<T, Options>;
	}

	return container.resolve(
		serviceIdentifier,
		options as ResolveOptions<T>,
	) as ResolveInstance<T, Options>;
}
