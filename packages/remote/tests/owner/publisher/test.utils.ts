/**
 * @overview Shared owner/rpc-owner-publisher fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { IRpcConnectorPublisher } from "../../../src/modules/owner";
import type {
	IRpcPeer,
	IRpcPeerHost,
	RpcPeerCallEvent,
	RpcPeerState,
	RpcPeerStateView,
} from "../../../src/modules/peer";
import {
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
} from "../../../src/modules/peer";
import { RpcEventTypeEnum } from "../../../src/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../../src/shared/enums/rpc-exception-code.enum";

export const IPublisherService =
	createServiceIdentifier<IPublisherServiceContract>("IPublisherService");

export function createCallEvent(
	peer: IRpcPeer,
	observationId: string,
): RpcPeerCallEvent {
	return {
		type: RpcEventTypeEnum.callFinished,
		observationId,
		peer,
		direction: RpcCallDirectionEnum.outgoing,
		service: "example.publisher.v1",
		method: "run",
		outcome: RpcCallStatusEnum.rejected,
		code: RpcExceptionCodeEnum.outcomeUnknown,
		durationMs: 0,
	};
}

export function registerTestPeer(
	publisher: Pick<IRpcConnectorPublisher, "registerPeer">,
	initialState: RpcPeerState,
): IRpcPeerHost {
	return publisher.registerPeer(initialState, createTestPeerHost);
}

export function createTestPeerHost(stateView: RpcPeerStateView): IRpcPeerHost {
	const peer: IRpcPeer = {
		get state() {
			return stateView.readState();
		},
		state$: stateView.state$,
		expose: () => () => {},
		resolve: () => {
			throw new Error("The Publisher test Peer has no remote facade.");
		},
	};
	return Object.freeze({
		peer,
		reserveIncomingCall: () => false,
		hasLocalExposure: () => false,
	});
}

interface IPublisherServiceContract {
	run(): void;
}
