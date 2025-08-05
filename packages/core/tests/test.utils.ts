import type { IContainer } from "../src/interfaces/container.interface";
import type { IMiddlewareManager } from "../src/interfaces/middleware-chain.interface";

/**
 * Cleans up a container by unregistering all services
 * @param container The container to clean up
 */
export function clearContainer(container: IContainer): void {
	if (container && !container.disposed) {
		try {
			const serviceIdentifiers = container.getServiceIdentifiers();
			serviceIdentifiers.forEach((serviceIdentifier) => {
				container.unregister(serviceIdentifier);
			});
		} catch (error) {
			// Ignore errors during cleanup
		}
	}
}

/**
 * Cleans up middleware by removing all middleware
 * @param middleware The middleware manager to clean up
 */
export function clearMiddleware(
	middleware: IMiddlewareManager<any, any>,
): void {
	if (middleware && !middleware.disposed) {
		try {
			const allMiddleware = middleware.all();
			middleware.unused(...allMiddleware);
		} catch (error) {
			// Ignore errors during cleanup
		}
	}
}
