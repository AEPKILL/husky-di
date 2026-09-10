/**
 * @overview Selects Network records belonging to this browser Connector and its Acceptor counterpart.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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
				entry.side === LabSideEnum.browser ||
				(peerId !== undefined && entry.handshake?.peerId === peerId) ||
				(sessionId !== undefined &&
					entry.handshakeFrame?.sessionId === sessionId),
		),
	};
}
