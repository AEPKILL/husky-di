/**
 * @overview Creates frozen non-thenable remote service facades.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import type {
	IRemoteServiceDescriptor,
	RemoteService,
	RpcMethodDefinitions,
} from "@/interfaces/peer/remote-service-descriptor.interface";

export type RpcFacadeInvocation = (
	method: string,
	cancelable: boolean,
	actualArguments: readonly unknown[],
) => Promise<unknown>;

/** Creates one facade without retaining current Session or membership state. */
export function createRpcFacade<T, Definitions extends RpcMethodDefinitions<T>>(
	descriptor: IRemoteServiceDescriptor<T, Definitions>,
	invoke: RpcFacadeInvocation,
): RemoteService<T, Definitions> {
	const data = getRemoteServiceDescriptorData(descriptor);
	const facade = Object.create(null) as Record<string, unknown>;

	for (const method of Object.keys(data.methods)) {
		const cancelable = data.methods[method] !== true;
		facade[method] = (...actualArguments: unknown[]) => {
			try {
				return invoke(method, cancelable, actualArguments);
			} catch (error) {
				return Promise.reject(error);
			}
		};
	}

	return Object.freeze(facade) as RemoteService<T, Definitions>;
}
