/**
 * @overview Test-only Peer and Owner collaborators for the Session lifecycle seam.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import {
	createRpcConnectorLifecycleState,
	createRpcConnectorSessionLifecycle,
	type IRpcConnectorSessionLifecycleAttachment,
	type IRpcConnectorSessionLifecycleOwner,
} from "../../src/modules/owner";
import type {
	IRpcPeerStateView,
	RpcPeerFactory,
	RpcSessionClosedState,
} from "../../src/modules/peer";
import type { IRpcProtocolSessionLifecycle } from "../../src/modules/protocol";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";

export function createRpcLifecycleFixture() {
	const state = createRpcConnectorLifecycleState();
	const failures: {
		attachment: IRpcConnectorSessionLifecycleAttachment;
		error: Error;
	}[] = [];
	const closings: { state: RpcSessionClosedState; forced: boolean }[] = [];
	const peerViews: IRpcPeerStateView[] = [];
	const createPeer: RpcPeerFactory = (view) => {
		peerViews.push(view);
		return {
			get state() {
				return view.readState();
			},
			state$: view.state$,
			expose: () => {
				throw new Error("Exposure is outside this lifecycle fixture.");
			},
			resolve: () => {
				throw new Error("Invocation is outside this lifecycle fixture.");
			},
		};
	};
	const owner: IRpcConnectorSessionLifecycleOwner = {
		beginClosing: (state, forced) => {
			closings.push({ state, forced });
		},
		failAttachment: (attachment, error) => {
			failures.push({ attachment, error });
			state.commit(state.state, { status: RpcStateStatusEnum.unbound });
		},
	};
	const options = { state, createPeer, owner };
	const lifecycle = createRpcConnectorSessionLifecycle(options);
	return {
		state,
		lifecycle,
		failures,
		closings,
		options,
		peerViews,
		attach(session: IRpcProtocolSessionLifecycle) {
			state.commit(state.state, { status: RpcStateStatusEnum.connecting });
			const attachment = lifecycle.attach(session);
			if (attachment === undefined)
				throw new Error("Expected attachment admission.");
			return attachment;
		},
	};
}
