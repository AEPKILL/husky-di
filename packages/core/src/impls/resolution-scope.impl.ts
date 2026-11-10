/**
 * @overview Owns resolution entry, record restoration, and deferred resumption.
 * @author AEPKILL
 * @created 2026-11-09 21:00:29
 */

import { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { CodedException } from "@/exceptions/coded.exception";
import { ResolveException } from "@/exceptions/resolve.exception";
import type { IContainer } from "@/interfaces/container.interface";
import type {
	IResolutionScope,
	ResolveRecordFactory,
} from "@/interfaces/resolution-scope.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { getServiceIdentifierName } from "@/utils/service-identifier.util";

export class ResolutionScopeImpl implements IResolutionScope {
	get current(): IInternalResolveRecord | undefined {
		return this._current;
	}

	private _current: IInternalResolveRecord | undefined;
	private readonly _contexts = new WeakMap<
		IInternalResolveRecord,
		ResolveContext
	>();

	constructor(private readonly _createResolveRecord: ResolveRecordFactory) {}

	run<T>(
		container: IContainer,
		operation: (
			resolveRecord: IInternalResolveRecord,
			resolveContext: ResolveContext,
		) => T,
	): T {
		const ownsRecord = !this._current;
		const record = this._current ?? this._createResolveRecord(container);
		this._current = record;
		try {
			return operation(record, this._ensureContext(record));
		} finally {
			if (ownsRecord) {
				this._contexts.delete(record);
				this._current = undefined;
			}
		}
	}

	withRecord<T>(
		container: IContainer,
		serviceIdentifier: ServiceIdentifier<unknown>,
		resolveRecord: IInternalResolveRecord,
		operation: () => T,
	): T {
		resolveRecord._internalStashCurrent();
		try {
			return operation();
		} catch (error: unknown) {
			if (ResolveException.isResolveException(error)) {
				throw error;
			}
			if (CodedException.isCodedException(error)) {
				throw new ResolveException(
					error.code as CoreErrorCodeEnum,
					error.detail,
					resolveRecord,
					error,
				);
			}

			const currentContainer = resolveRecord.getCurrentContainer() ?? container;
			throw new ResolveException(
				CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				`Failed to resolve service identifier "${getServiceIdentifierName(serviceIdentifier)}" in "${currentContainer.displayName}": ${error instanceof Error ? error.message : String(error)}`,
				resolveRecord,
				error,
			);
		} finally {
			resolveRecord._internalRestoreCurrent();
		}
	}

	defer<T>(resolveRecord: IInternalResolveRecord, operation: () => T): () => T {
		const current = resolveRecord.current;
		const context = this._ensureContext(resolveRecord);
		return () => {
			const previousRecord = this._current;
			const previousCurrent = resolveRecord.current;
			const previousContext = this._contexts.get(resolveRecord);
			try {
				this._contexts.set(resolveRecord, context);
				this._current = resolveRecord;
				resolveRecord._internalSetCurrent(current);
				return operation();
			} finally {
				resolveRecord._internalSetCurrent(previousCurrent);
				if (previousContext) {
					this._contexts.set(resolveRecord, previousContext);
				} else {
					this._contexts.delete(resolveRecord);
				}
				this._current = previousRecord;
			}
		};
	}

	private _ensureContext(
		resolveRecord: IInternalResolveRecord,
	): ResolveContext {
		let context = this._contexts.get(resolveRecord);
		if (!context) {
			context = new Map();
			this._contexts.set(resolveRecord, context);
		}
		return context;
	}
}
