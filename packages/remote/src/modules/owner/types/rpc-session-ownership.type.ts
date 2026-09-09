/**
 * @overview Internal dependencies shared by Session record and role ownership assembly.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcPeerFactory } from "@/modules/peer";

export type RpcSessionOwnershipDependencies = Readonly<{
	readonly createPeer: RpcPeerFactory;
}>;
