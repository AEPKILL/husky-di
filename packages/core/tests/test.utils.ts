/**
 * @overview Shared test utilities for core package tests.
 * @author AEPKILL
 * @created 2025-08-05 22:21:10
 */

import {
	type IContainer,
	middleware,
	type ResolveMiddleware,
} from "../src/index";

/**
 * Cleans up a container by unregistering all services
 * @param container The container to clean up
 */
export function clearContainer(container: IContainer): void {
	if (container && !container.disposed) {
		const serviceIdentifiers = container.getServiceIdentifiers();
		serviceIdentifiers.forEach((serviceIdentifier) => {
			container.unregisterAll(serviceIdentifier);
		});
	}
}

/**
 * Registers global middleware and retains its public cleanup handle for tests.
 */
export function useMiddleware(
	// biome-ignore lint/suspicious/noExplicitAny: generic middleware helper for tests
	...middlewares: ResolveMiddleware<any, any>[]
): () => void {
	const cleanup = middleware.use(...middlewares);
	middlewareCleanups.add(cleanup);
	return cleanup;
}

/** Cleans up middleware through the handles returned by public use calls. */
export function clearMiddleware(): void {
	for (const cleanup of middlewareCleanups) {
		cleanup();
	}
	middlewareCleanups.clear();
}

const middlewareCleanups = new Set<() => void>();
