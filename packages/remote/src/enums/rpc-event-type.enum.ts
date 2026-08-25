/**
 * @overview Caller-visible RPC event type enum.
 * @author AEPKILL
 * @created 2026-08-20 00:00:00
 */

export enum RpcEventTypeEnum {
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
