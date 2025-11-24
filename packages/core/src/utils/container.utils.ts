/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-30 22:53:06
 */

import { ResolveException } from "@/exceptions/resolve.exception";
import type {
	IContainer,
	ResolveInstance,
	ResolveOptions,
} from "@/interfaces/container.interface";
import { resolveRecordRef } from "@/shared/instances";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

function _resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;
function _resolve<T, Options extends ResolveOptions<T>>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: Options,
): ResolveInstance<T, Options>;
function _resolve<T, Options extends ResolveOptions<T>>(
	serviceIdentifier: ServiceIdentifier<T>,
	options?: Options,
): ResolveInstance<T, Options> {
	const resolveRecord = resolveRecordRef.current;

	if (!resolveRecord) {
		throw new Error(
			`The "resolve" method can only be called within a resolve context. This typically happens when trying to resolve a service outside of a container's resolve process.`,
		);
	}

	const currentContainer = resolveRecord.getCurrentContainer();

	if (currentContainer) {
		return currentContainer.resolve(
			serviceIdentifier,
			options as Options,
		) as ResolveInstance<T, Options>;
	}

	throw new ResolveException(
		`No container available in the current resolve context. This usually indicates that the resolve context has been corrupted or improperly initialized.`,
		resolveRecord,
	);
}

export const resolve: IContainer["resolve"] = _resolve;
