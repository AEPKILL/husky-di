/**
 * Root container instance.
 *
 * @overview
 * The default root container that serves as the top-level container
 * in the dependency injection hierarchy. All containers without an
 * explicit parent will use this as their parent container.
 *
 * @author AEPKILL
 * @created 2025-08-04 23:12:47
 */

import { Container } from "@/impls/Container";
import type { IContainer } from "@/interfaces/container.interface";

/**
 * The root container instance.
 *
 * @remarks
 * This is the default parent container for all containers created
 * without an explicit parent. It provides a global scope for
 * service registration and resolution.
 */
export const rootContainer: IContainer = new Container("Root");
