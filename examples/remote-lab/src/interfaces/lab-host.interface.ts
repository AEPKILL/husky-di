/**
 * @overview Acceptor-side ownership of Lab scenarios and their inspectable application state.
 * @author AEPKILL
 * @created 2026-09-10 00:38:10
 */

import type { IRpcPeer } from "@husky-di/remote";
import type { ILabCustomServices } from "@/interfaces/lab-custom-services.interface";
import type { LabServerSnapshot } from "@/types/lab-server.type";

export interface ILabHost {
	readonly custom: ILabCustomServices;
	openPeer(peer: IRpcPeer): void;
	closePeer(peer: IRpcPeer): void;
	peerId(peer: IRpcPeer): string | undefined;
	snapshot(): LabServerSnapshot;
	resumeAll(): void;
}
