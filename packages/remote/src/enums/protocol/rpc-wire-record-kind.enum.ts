/**
 * @overview Built-in RPC wire record kind enum.
 * @author AEPKILL
 * @created 2026-08-20 00:00:00
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
	streamMethod = "stream-method",
	streamProperty = "stream-property",
	streamItem = "stream-item",
	streamCredit = "stream-credit",
	streamCancel = "stream-cancel",
	streamComplete = "stream-complete",
	streamError = "stream-error",
	message = "message",
	ack = "ack",
	ping = "ping",
	pong = "pong",
	close = "close",
}
