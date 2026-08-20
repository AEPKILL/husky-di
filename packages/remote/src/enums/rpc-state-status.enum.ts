/**
 * @overview Caller-visible RPC state status enum.
 * @author AEPKILL
 * @created 2026-08-20 00:00:00
 */

export enum RpcStateStatusEnum {
	unbound = "unbound",
	connecting = "connecting",
	connected = "connected",
	draining = "draining",
	recovering = "recovering",
	closed = "closed",
	active = "active",
	closing = "closing",
	idle = "idle",
	starting = "starting",
	listening = "listening",
	stopped = "stopped",
}
