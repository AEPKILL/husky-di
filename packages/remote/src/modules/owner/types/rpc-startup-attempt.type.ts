/**
 * @overview Owner attempt records retained through Adapter startup and cleanup.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { Subscription } from "rxjs";
import type {
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/modules/owner/interfaces/rpc-owner-custody.interface";
import type { IRpcConnectorSessionAttachment } from "@/modules/owner/interfaces/rpc-session-ownership.interface";

export type RpcConnectorAttempt = {
	readonly abortController: AbortController;
	readonly ownerAbort: Promise<never>;
	readonly rejectOwnerAbort: (error: Error) => void;
	readonly startupCleanup: RpcOwnedCleanup;
	removeExternalAbortListener?: () => void;
	subscription?: Subscription;
	connection?: RpcOwnedConnection;
	attachment?: IRpcConnectorSessionAttachment;
	insideHandoff: boolean;
	cleanupRequested: boolean;
	fenced: boolean;
	ownerAbortError?: Error;
};

export type RpcAcceptorListenerAttempt = {
	readonly abortController: AbortController;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
	readonly listenerCleanup: RpcOwnedCleanup;
	readonly startupCleanup: RpcOwnedCleanup;
	subscription?: Subscription;
	ready: boolean;
	terminal: boolean;
	cleanupRequested: boolean;
	cleanupBarrier?: Promise<void>;
};
