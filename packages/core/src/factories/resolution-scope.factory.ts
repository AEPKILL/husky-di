/**
 * @overview Assembles the resolution scope with its diagnostic record creator.
 * @author AEPKILL
 * @created 2026-11-09 21:00:29
 */

import { ResolutionScopeImpl } from "@/impls/resolution-scope.impl";
import { ResolveRecordImpl } from "@/impls/resolve-record.impl";
import type { IResolutionScope } from "@/interfaces/resolution-scope.interface";

export function createResolutionScope(): IResolutionScope {
	return new ResolutionScopeImpl(
		(container) => new ResolveRecordImpl(container),
	);
}
