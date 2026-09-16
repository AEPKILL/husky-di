/**
 * @overview Built-in RPC wire record kind enum.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

export enum RpcWireRecordKindEnum {
	fresh = "fresh",
	accept = "accept",
	resume = "resume",
	reject = "reject",
	call = "call",
	cancel = "cancel",
	result = "result",
	error = "error",
	streamOpen = "stream-open",
	streamNext = "stream-next",
	streamComplete = "stream-complete",
	streamError = "stream-error",
	streamCancel = "stream-cancel",
	message = "message",
	ack = "ack",
	ping = "ping",
	pong = "pong",
	close = "close",
}
