/**
 * Resolution context type definition.
 *
 * @overview
 * Represents the context in which service resolution occurs. This context
 * tracks which registrations have been resolved and their corresponding
 * instances, enabling resolution-scoped lifecycle management and preventing
 * duplicate resolution within the same context.
 *
 * @author AEPKILL
 * @created 2021-10-02 09:22:05
 */

import type { IRegistration } from "@/interfaces/registration.interface";

/**
 * Map of registrations to their resolved instances within a resolution context.
 * Used to track and reuse instances during a single resolution chain.
 */
export type ResolveContext = Map<IRegistration<unknown>, unknown>;
