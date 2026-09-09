/**
 * @overview Acceptor-side ownership of Lab scenarios and their inspectable application state.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcPeer } from "@husky-di/remote";
import type { LabServerSnapshot } from "@/types/lab-server.type";

export interface ILabHost {
	openPeer(peer: IRpcPeer): void;
	closePeer(peer: IRpcPeer): void;
	peerId(peer: IRpcPeer): string | undefined;
	snapshot(): LabServerSnapshot;
	resumeAll(): void;
}
