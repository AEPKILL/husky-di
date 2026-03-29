/**
 * @overview Shared test utilities for core package tests.
 * @author AEPKILL
 * @created 2025-08-05 22:21:10
 */

import type { IContainer } from "../src/interfaces/container.interface";
import type { IMiddlewareManager } from "../src/interfaces/middleware-chain.interface";

/**
 * Cleans up a container by unregistering all services
 * @param container The container to clean up
 */
export function clearContainer(container: IContainer): void {
	if (container && !container.disposed) {
		const serviceIdentifiers = container.getServiceIdentifiers();
		serviceIdentifiers.forEach((serviceIdentifier) => {
			container.unregister(serviceIdentifier);
		});
	}
}

/**
 * Cleans up middleware by removing all middleware
 * @param middleware The middleware manager to clean up
 */
export function clearMiddleware(
	// biome-ignore lint/suspicious/noExplicitAny: generic middleware helper for tests
	middleware: IMiddlewareManager<any, any>,
): void {
	if (middleware && !middleware.disposed) {
		const allMiddleware = middleware.all();
		middleware.unused(...allMiddleware);
	}
}
