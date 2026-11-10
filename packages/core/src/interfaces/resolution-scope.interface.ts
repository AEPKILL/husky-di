/**
 * @overview Internal ownership of active and deferred resolution scopes.
 * @author AEPKILL
 * @created 2026-11-09 21:00:29
 */

import type { IContainer } from "@/interfaces/container.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type ResolveRecordFactory = (
	container: IContainer,
) => IInternalResolveRecord;

export interface IResolutionScope {
	readonly current: IInternalResolveRecord | undefined;

	/** Joins the active chain or owns a new one until the operation exits. */
	run<T>(
		container: IContainer,
		operation: (
			resolveRecord: IInternalResolveRecord,
			resolveContext: ResolveContext,
		) => T,
	): T;

	/** Restores the record position and reports errors with their original path. */
	withRecord<T>(
		container: IContainer,
		serviceIdentifier: ServiceIdentifier<unknown>,
		resolveRecord: IInternalResolveRecord,
		operation: () => T,
	): T;

	/** Captures a chain for later execution without disturbing a surrounding chain. */
	defer<T>(resolveRecord: IInternalResolveRecord, operation: () => T): () => T;
}
