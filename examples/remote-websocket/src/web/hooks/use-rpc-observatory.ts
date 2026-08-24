/**
 * @overview Projects public RPC state and events into observable dashboard data.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import type {
	IRpcConnector,
	RpcConnectorState,
	RpcEvent,
	RpcPeerState,
} from "@husky-di/remote";
import { useEffect, useState } from "react";

import type {
	PendingCallDiagnostic,
	RpcEventDiagnostic,
} from "@/types/rpc-diagnostics.type";
import { updatePendingCallDiagnostics } from "@/web/utils/pending-call-ledger.util";

export function useRpcObservatory(connector: IRpcConnector) {
	const [connectorState, setConnectorState] = useState<RpcConnectorState>(
		connector.state,
	);
	const [peerState, setPeerState] = useState<RpcPeerState>(
		connector.peer.state,
	);
	const [pendingCalls, setPendingCalls] = useState<
		readonly PendingCallDiagnostic[]
	>([]);
	const [events, setEvents] = useState<readonly RpcEventDiagnostic[]>([]);

	useEffect(() => {
		const subscriptions = [
			connector.state$.subscribe(setConnectorState),
			connector.peer.state$.subscribe(setPeerState),
			connector.event$.subscribe((event) => {
				const timestamp = Date.now();
				setEvents((current) => [
					toDiagnostic(event, timestamp),
					...current.slice(0, 39),
				]);
				setPendingCalls((current) =>
					updatePendingCallDiagnostics(current, event, timestamp),
				);
			}),
		];

		return () => {
			subscriptions.forEach((subscription) => {
				subscription.unsubscribe();
			});
		};
	}, [connector]);

	return { connectorState, peerState, pendingCalls, events };
}

function toDiagnostic(event: RpcEvent, timestamp: number): RpcEventDiagnostic {
	return {
		id:
			"observationId" in event
				? event.observationId
				: `${timestamp}-${event.type}`,
		type: event.type,
		timestamp,
		direction: "direction" in event ? event.direction : undefined,
		service: "service" in event ? event.service : undefined,
		member: "member" in event ? event.member : undefined,
		outcome: "outcome" in event ? event.outcome : undefined,
		code: "code" in event ? event.code : undefined,
	};
}
