/**
 * @overview Internal stable Peer and retained Session ownership capabilities.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { IRpcPeer } from "@/modules/peer";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "@/modules/protocol";

export interface IRpcSessionRecord {
	readonly peer: IRpcPeer;
	readonly session: IRpcProtocolSession | undefined;
	attach(session: IRpcProtocolSession): IRpcProtocolSessionHost | undefined;
	hasLocalExposure(wireName: string): boolean;
	owns(session: IRpcProtocolSession): boolean;
	isFenced(session: IRpcProtocolSession): boolean;
	fence(session: IRpcProtocolSession): (() => void) | undefined;
	release(session?: IRpcProtocolSession): IRpcProtocolSession | undefined;
}
