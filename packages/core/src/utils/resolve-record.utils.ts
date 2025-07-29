/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 00:25:55
 */

import { ResolveRecord } from "@/impls/ResolveRecord";
import type { IContainer } from "@/interfaces/container.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import { resolveRecordRef } from "@/shared/instances";

export function getResolveRecord(): IInternalResolveRecord | undefined {
	return resolveRecordRef.current;
}

export function getEnsureResolveRecord(
	container: IContainer,
): IInternalResolveRecord {
	if (!resolveRecordRef.current) {
		resolveRecordRef.current = new ResolveRecord(container);
	}
	return resolveRecordRef.current;
}

export function resetResolveRecord(): void {
	resolveRecordRef.current = undefined;
}
