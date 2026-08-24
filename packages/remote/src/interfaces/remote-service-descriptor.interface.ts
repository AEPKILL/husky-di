/**
 * @overview Public opaque Remote Service Descriptor contract.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcMemberDefinitions } from "@/types/remote-service-descriptor.type";

declare const REMOTE_SERVICE_DESCRIPTOR_TYPE: unique symbol;

/**
 * Describes one explicitly allowlisted remote service without exposing its
 * local identifier or wire metadata.
 */
export interface IRemoteServiceDescriptor<
	T,
	Members extends RpcMemberDefinitions<T>,
> {
	readonly [REMOTE_SERVICE_DESCRIPTOR_TYPE]: (
		service: T,
		members: Members,
	) => readonly [T, Members];
}
