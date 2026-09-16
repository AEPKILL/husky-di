/**
 * @overview Internal dependencies shared by Session record and role ownership assembly.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import type { RpcPeerFactory } from "@/modules/peer";

export type RpcSessionOwnershipDependencies = Readonly<{
	readonly createPeer: RpcPeerFactory;
}>;
