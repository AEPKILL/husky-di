/**
 * @overview Caller-visible RPC state status enum.
 * @author AEPKILL
 * @created 2026-09-07 23:22:09
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
	monitoring = "monitoring",
	reconnecting = "reconnecting",
	waiting = "waiting",
	stopped = "stopped",
}
