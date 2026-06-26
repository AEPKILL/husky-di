/**
 * Resolve helper options type definition.
 *
 * @overview
 * Defines helper-only options for the package-level `resolve()` utility.
 * These options extend normal container resolve options without changing the
 * semantics of `container.resolve()`.
 *
 * @author AEPKILL
 * @created 2026-06-26 00:00:00
 */

import type { ResolveContainerScopeEnum } from "@/enums/resolve-container-scope.enum";
import type { ResolveOptions } from "@/interfaces/container.interface";

/**
 * Options for the package-level resolve helper.
 *
 * @remarks
 * Extends normal resolve options with a helper-only container scope selector.
 * This selector does not affect `container.resolve()` and only controls which
 * container perspective the package-level `resolve()` helper uses when
 * continuing an active resolution chain.
 *
 * @typeParam T - The type of the service instance to resolve
 */
export type ResolveHelperOptions<T> = ResolveOptions<T> & {
	/**
	 * The container perspective used by the package-level `resolve()` helper.
	 *
	 * @remarks
	 * - `current`: continue from the container currently resolving the service
	 * - `origin`: continue from the container that started the resolution chain
	 *
	 * @default ResolveContainerScopeEnum.current
	 */
	scope?: ResolveContainerScopeEnum;
};
