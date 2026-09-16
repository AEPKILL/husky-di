/**
 * @overview Creates frozen non-thenable remote service facades.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

import { defer, isObservable, type Observable } from "rxjs";
import { getRemoteServiceDescriptorData } from "@/modules/peer/factories/remote-service-descriptor.factory";
import type {
	RemoteService,
	RemoteServiceDescriptor,
	RpcMemberDefinition,
	RpcMemberDefinitions,
	RpcMemberKind,
} from "@/modules/peer/types/remote-service-descriptor.type";

export type RpcFacadeInvocation = (
	member: string,
	cancelable: boolean,
	actualArguments: readonly unknown[],
	kind?: RpcMemberKind,
) => unknown;

/** Creates one facade without retaining current Session or membership state. */
export function createRpcFacade<T, Definitions extends RpcMemberDefinitions<T>>(
	descriptor: RemoteServiceDescriptor<T, Definitions>,
	invoke: RpcFacadeInvocation,
): RemoteService<T, Definitions> {
	const data = getRemoteServiceDescriptorData(descriptor);
	const facade = Object.create(null) as Record<string, unknown>;

	for (const member of Object.keys(data.members)) {
		const definition = data.members[member] as RpcMemberDefinition;
		const cancelable =
			definition.kind === "function" && "cancelable" in definition;
		if (definition.kind === "observable") {
			facade[member] = createObservableFacade(() =>
				invoke(member, false, [], definition.kind),
			);
			continue;
		}
		facade[member] = (...actualArguments: unknown[]) => {
			if (definition.kind === "observable-function") {
				return createObservableFacade(() =>
					invoke(member, false, actualArguments, definition.kind),
				);
			}
			try {
				return Promise.resolve(
					invoke(member, cancelable, actualArguments, definition.kind),
				);
			} catch (error) {
				return Promise.reject(error);
			}
		};
	}

	return Object.freeze(facade) as RemoteService<T, Definitions>;
}

function createObservableFacade(invoke: () => unknown): Observable<unknown> {
	return defer(() => {
		const value = invoke();
		if (!isObservable(value)) {
			throw new TypeError(
				"RPC Observable member did not return an Observable.",
			);
		}
		return value;
	});
}
