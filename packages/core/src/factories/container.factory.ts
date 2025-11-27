/**
 * Container factory function.
 *
 * @overview
 * Provides a convenient factory function for creating new container instances.
 * Containers can be created with a custom name and optional parent container
 * to establish a hierarchical dependency injection structure.
 *
 * @author AEPKILL
 * @created 2025-07-30 22:39:29
 */

import { Container } from "@/impls/Container";
import type { IContainer } from "@/interfaces/container.interface";

/**
 * Creates a new container instance.
 *
 * @param name - The display name for the container (default: "AnonymousContainer")
 * @param parent - Optional parent container. If not provided, uses the root container
 * @returns A new container instance
 *
 * @example
 * ```typescript
 * // Create a root container
 * const container = createContainer("AppContainer");
 *
 * // Create a child container
 * const childContainer = createContainer("ChildContainer", container);
 * ```
 */
export function createContainer(
	name: string = "AnonymousContainer",
	parent?: IContainer,
): IContainer {
	return new Container(name, parent ?? Container.rootContainer);
}
