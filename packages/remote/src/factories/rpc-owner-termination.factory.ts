/**
 * @overview Assembles separate Owner and transaction views of one private termination lifetime.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import {
	type CreateRpcOwnerTerminationOptions,
	RpcOwnerTerminationImpl,
} from "@/impls/owner/rpc-owner-termination.impl";
import type { RpcOwnerTerminationFactory } from "@/interfaces/owner/rpc-owner-termination.interface";

/** Creates the phase-owning lifetime without invoking its runtime dependencies. */
export function createRpcOwnerTermination<TClosed>(
	options: CreateRpcOwnerTerminationOptions<TClosed>,
): ReturnType<RpcOwnerTerminationFactory<TClosed>> {
	const termination = new RpcOwnerTerminationImpl(options);
	return Object.freeze({
		owner: Object.freeze({
			get requested() {
				return termination.requested;
			},
			shutdown: () => termination.shutdown(),
			close: () => termination.close(),
		}),
		lifecycle: Object.freeze({
			ensureTermination: () => termination.ensureTermination(),
			enterGrace: () => termination.enterGrace(),
			enterClosing: (finalState: TClosed) =>
				termination.enterClosing(finalState),
		}),
	});
}
