/**
 * @overview Creates frozen non-thenable remote service facades.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Observable, type Subscriber, type TeardownLogic } from "rxjs";

import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type {
	RemoteService,
	RpcMemberDefinitions,
} from "@/types/remote-service-descriptor.type";

export type RpcFacadeInvocation = (
	method: string,
	cancelable: boolean,
	actualArguments: readonly unknown[],
) => Promise<unknown>;

type RpcFacadeStreamSubscription = (
	member: string,
	actualArguments: readonly unknown[],
	subscriber: Subscriber<unknown>,
) => TeardownLogic;

/** Creates one facade without retaining current Session or membership state. */
export function createRpcFacade<T, Definitions extends RpcMemberDefinitions<T>>(
	descriptor: IRemoteServiceDescriptor<T, Definitions>,
	invoke: RpcFacadeInvocation,
	subscribe: RpcFacadeStreamSubscription,
): RemoteService<T, Definitions> {
	const data = getRemoteServiceDescriptorData(descriptor);
	const facade = Object.create(null) as Record<string, unknown>;
	const createRemoteObservable = (
		member: string,
		actualArguments: readonly unknown[],
	): Observable<unknown> =>
		new Observable((subscriber) =>
			subscribe(member, actualArguments, subscriber),
		);

	for (const [member, interaction] of Object.entries(data.members)) {
		if (interaction.kind === "stream-property") {
			facade[member] = createRemoteObservable(member, []);
			continue;
		}
		if (interaction.kind === "stream-method") {
			facade[member] = (...actualArguments: unknown[]) =>
				createRemoteObservable(member, actualArguments);
			continue;
		}
		const cancelable = interaction.cancelable;
		facade[member] = (...actualArguments: unknown[]) => {
			try {
				return invoke(member, cancelable, actualArguments);
			} catch (error) {
				return Promise.reject(error);
			}
		};
	}

	return Object.freeze(facade) as RemoteService<T, Definitions>;
}
