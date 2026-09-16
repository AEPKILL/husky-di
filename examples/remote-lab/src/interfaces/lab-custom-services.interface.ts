/**
 * @overview Shared Node and browser management boundary for real custom RPC experiments.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import type { IRpcPeer, RpcStateStatusEnum } from "@husky-di/remote";
import type {
	LabCustomCommand,
	LabCustomCommandResult,
	LabCustomSnapshot,
	LabCustomTarget,
} from "@/types/lab-custom-services.type";

export interface ILabCustomServices {
	snapshot(): LabCustomSnapshot;
	execute(command: LabCustomCommand): LabCustomCommandResult;
	/** Finds evidence for a submitted request without replaying its operation. */
	operation(requestId: string): LabCustomCommandResult | undefined;
}

export interface ILabCustomTargets {
	exposure(target: LabCustomTarget):
		| (Pick<IRpcPeer, "expose"> & {
				readonly state: { readonly status: RpcStateStatusEnum };
		  })
		| undefined;
	peer(target: LabCustomTarget): IRpcPeer | undefined;
}
