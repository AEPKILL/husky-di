/**
 * @overview Allocates Owner startup attempts and registers their cancellation cleanup before transport handoff.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcOwnerCustody } from "@/modules/owner/interfaces/rpc-owner-custody.interface";
import type {
	RpcAcceptorListenerAttempt,
	RpcConnectorAttempt,
} from "@/modules/owner/types/rpc-startup-attempt.type";

export function createRpcConnectorAttempt(
	custody: Pick<IRpcOwnerCustody, "ownCleanup">,
) {
	let attempt!: RpcConnectorAttempt;
	const { promise: ownerAbort, reject: rejectOwnerAbort } =
		Promise.withResolvers<never>();
	void ownerAbort.catch(() => {});
	const {
		promise: adapterStartup,
		resolve: resolveAdapterStartup,
		reject: rejectAdapterStartup,
	} = Promise.withResolvers<void>();
	const startupCleanupTask = createRpcStartupCleanup(
		adapterStartup,
		() => attempt.cleanupRequested,
	);
	void startupCleanupTask.catch(() => {});
	const startupCleanup = custody.ownCleanup(() => startupCleanupTask);
	attempt = {
		abortController: new AbortController(),
		ownerAbort,
		rejectOwnerAbort,
		startupCleanup,
		insideHandoff: false,
		cleanupRequested: false,
		fenced: false,
	};
	return {
		attempt,
		adapterStartup,
		resolveAdapterStartup,
		rejectAdapterStartup,
	};
}

export function createRpcAcceptorListenerAttempt(
	custody: Pick<IRpcOwnerCustody, "ownCleanup">,
) {
	const {
		promise: startup,
		resolve: resolveStartup,
		reject: rejectStartup,
	} = Promise.withResolvers<void>();
	const {
		promise: adapterStartup,
		resolve: resolveAdapterStartup,
		reject: rejectAdapterStartup,
	} = Promise.withResolvers<void>();
	let attempt!: RpcAcceptorListenerAttempt;
	const startupCleanupTask = Promise.race([
		createRpcStartupCleanup(adapterStartup, () => attempt.cleanupRequested),
		// Give a synchronous Adapter abort rejection first claim on cleanup.
		startup
			.then(
				() => undefined,
				() => undefined,
			)
			.then(() => undefined),
	]);
	void startupCleanupTask.catch(() => {});
	const listenerCleanup = custody.ownCleanup(() =>
		attempt.subscription?.unsubscribe(),
	);
	const startupCleanup = custody.ownCleanup(() => startupCleanupTask);
	attempt = {
		abortController: new AbortController(),
		resolve: resolveStartup,
		reject: rejectStartup,
		listenerCleanup,
		startupCleanup,
		ready: false,
		terminal: false,
		cleanupRequested: false,
	};
	return {
		attempt,
		startup,
		adapterStartup,
		resolveAdapterStartup,
		rejectAdapterStartup,
	};
}

function createRpcStartupCleanup(
	startup: Promise<void>,
	isCleanupRequested: () => boolean,
): Promise<void> {
	return startup.then(
		() => undefined,
		(error: unknown) => {
			// Cleanup suppresses only the AbortError produced by its own cancellation.
			const cleanupFailed =
				isCleanupRequested() &&
				!(error instanceof DOMException && error.name === "AbortError");
			if (cleanupFailed) {
				throw error;
			}
		},
	);
}
