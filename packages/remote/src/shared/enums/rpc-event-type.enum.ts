/**
 * @overview Caller-visible RPC event type enum.
 * @author AEPKILL
 * @created 2026-09-07 23:22:09
 */

export enum RpcEventTypeEnum {
	streamOpened = "stream-opened",
	streamFinished = "stream-finished",
	callStarted = "call-started",
	callFinished = "call-finished",
	peerOpened = "peer-opened",
	peerRecovering = "peer-recovering",
	peerRecovered = "peer-recovered",
	peerDraining = "peer-draining",
	peerClosed = "peer-closed",
	ownerDraining = "owner-draining",
	ownerClosing = "owner-closing",
	topologyClosed = "topology-closed",
}
