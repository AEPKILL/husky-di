/**
 * @overview Private Endpoint binding-attempt contract for one Physical Connection.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcSession } from "@/interfaces/session/rpc-session.interface";
import type { RpcBindingAttemptLease } from "@/types/protocol/rpc-binding-attempt.type";
import type { RpcBindingEpoch } from "@/types/protocol/rpc-session.type";

export interface IRpcBindingAttempt<TKey> {
	readonly task: Promise<void>;
	readonly pending: boolean;
	send(message: Uint8Array): Promise<void>;
	runCrypto<T>(operation: () => Promise<T>): Promise<T>;
	ownTemporary(release: () => void): RpcBindingAttemptLease;
	ownProvisionalSession(
		session: IRpcSession<TKey>,
		discard: () => void,
	): boolean;
	holdsProvisionalSession(session: IRpcSession<TKey>): boolean;
	claim(): IRpcEndpoint | undefined;
	transferProvisionalSession(session: IRpcSession<TKey>): boolean;
	failInstalledBinding(binding: RpcBindingEpoch, error: Error): void;
	transferBinding(binding: RpcBindingEpoch, reply?: Uint8Array): Promise<void>;
	fail(error: unknown, reason?: RpcEndpointFailureEnum): void;
}
