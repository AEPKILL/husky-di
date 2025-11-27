/**
 * Factory for creating export guard middleware.
 *
 * @overview
 * This middleware enforces export restrictions for module containers. It ensures
 * that only explicitly exported service identifiers can be accessed from outside
 * the container. Internal access (within the same container) is always allowed.
 *
 * @remarks
 * The middleware distinguishes between internal and external access by checking
 * the resolution path. If the previous resolution step occurred in the same
 * container, it's considered internal access. Otherwise, it's external access
 * and must be in the exports list.
 *
 * @author AEPKILL
 * @created 2025-08-18 22:01:34
 */

import {
	getServiceIdentifierName,
	type IContainer,
	isResolveServiceIdentifierRecord,
	ResolveException,
	type ResolveMiddleware,
	type ResolveRecordTreeNode,
	type ServiceIdentifier,
} from "@husky-di/core";

/**
 * Creates a middleware factory that guards against accessing non-exported services.
 *
 * @param exports - Array of service identifiers that are allowed to be accessed from outside the container
 * @returns A resolve middleware that enforces export restrictions
 *
 * @remarks
 * The middleware works by:
 * 1. Checking if the current resolution is from within the same container (internal access)
 * 2. If external access is detected, verifying that the service identifier is in the exports list
 * 3. Throwing a ResolveException if a non-exported service is accessed externally
 *
 * Note: Services not registered in the container are not considered external access,
 * as they will be resolved from parent containers or fail with a different error.
 */
export function createExportedGuardMiddlewareFactory(
	exports: ReadonlyArray<ServiceIdentifier<unknown>>,
	// biome-ignore lint/suspicious/noExplicitAny: should be any
): ResolveMiddleware<any, any> {
	const exportedSet = new Set(exports);
	return {
		name: "ExportGuard",
		executor(params, next) {
			const { serviceIdentifier, container, resolveRecord } = params;

			const previousContainer = findPreviousContainer(resolveRecord.getPaths());

			// If the previous resolution step was in the same container, this is internal access.
			// Internal access is always allowed, regardless of export status.
			if (previousContainer === container) {
				return next(params);
			}

			// External access detected: check if the service identifier is exported.
			// Only throw an error if the service is registered in this container but not exported.
			// If the service is not registered here, it will be resolved from parent containers
			// or fail with a different error, so we don't need to handle it here.
			if (!exportedSet.has(serviceIdentifier)) {
				if (container.isRegistered(serviceIdentifier, { recursive: true })) {
					throw new ResolveException(
						`Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not exported from ${container.displayName}.`,
						resolveRecord,
					);
				}
			}

			return next(params);
		},
	};
}

/**
 * Finds the container that performed the previous service identifier resolution in the path.
 *
 * @param paths - Array of resolution record tree nodes representing the resolution path from root to current
 * @returns The container from the previous service identifier resolution, or undefined if there is no previous one
 *
 * @remarks
 * This function traverses the resolution path and finds the second-to-last container
 * that performed a service identifier resolution. This is used to determine if the
 * current resolution is an internal access (same container) or external access (different container).
 *
 * The function looks for service identifier records in the path and returns the container
 * from the record that appears before the last one. If there's only one or no service
 * identifier records, it returns undefined.
 */
function findPreviousContainer(
	paths: Array<ResolveRecordTreeNode<unknown>>,
): IContainer | undefined {
	let lastContainer: IContainer | undefined;
	for (const path of paths) {
		if (isResolveServiceIdentifierRecord(path.value)) {
			// If we've already found a container, return the current one (second-to-last)
			if (lastContainer) {
				return path.value.container;
			}
			// Otherwise, record this as the last container we've seen
			lastContainer = path.value.container;
		}
	}
	// If we only found one or no containers, return undefined
	return undefined;
}
