/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-02 09:22:05
 */

import type { ServiceIdentifier } from "./service-identifier.type";

/**
 * ResolveContext
 * @example
 * ```
 * {
 *   serviceIdentifier: {
 *     getResolveOptionKey(resolveOptions | metadata): Array<instance>
 *   }
 * }
 *
 * ```
 */
export type ResolveContext = Map<ServiceIdentifier<any>, Map<string, any[]>>;
