/**
 * @overview Selects every recorded call and message belonging to the current Peer.
 * @author AEPKILL
 * @created 2026-09-10 21:55:04
 */

import { RpcCallDirectionEnum } from "@husky-di/remote";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import type { RenderDevtoolsOptions } from "@/web/types/devtools.type";

export function selectNetworkRecords({
	peerId,
	sessionId,
	calls,
	entries,
}: Pick<
	RenderDevtoolsOptions,
	"peerId" | "sessionId" | "calls" | "entries"
>): Pick<RenderDevtoolsOptions, "calls" | "entries"> {
	const isE2eCall = (traceId: string): boolean => traceId.startsWith("e2e:");
	const browserInvocations = new Set(
		calls
			.filter(
				(call) =>
					call.side === LabSideEnum.browser &&
					call.direction === RpcCallDirectionEnum.outgoing,
			)
			.map((call) => JSON.stringify([call.traceId, call.service, call.method])),
	);
	return {
		calls: calls.filter(
			(call) =>
				isE2eCall(call.traceId) ||
				call.side === LabSideEnum.browser ||
				call.peerId === peerId ||
				(call.peerId === "acceptor" &&
					call.direction === RpcCallDirectionEnum.incoming &&
					browserInvocations.has(
						JSON.stringify([call.traceId, call.service, call.method]),
					)),
		),
		entries: entries.filter(
			(entry) =>
				entry.managedE2e === true ||
				entry.summary.includes("e2e:") ||
				entry.side === LabSideEnum.browser ||
				(peerId !== undefined && entry.summary.startsWith(`${peerId} ·`)) ||
				(peerId !== undefined && entry.handshake?.peerId === peerId) ||
				(sessionId !== undefined &&
					(entry.transportMessage?.sessionId === sessionId ||
						entry.handshakeFrame?.sessionId === sessionId)),
		),
	};
}
