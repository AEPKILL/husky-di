/**
 * @overview 仅用于原型——暂定 RPC 用法所共用的服务。
 *
 * 这些值让 Connector 与 Acceptor 用法专注于暂定 interface，而不重复业务实现。
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import type { ServiceIdentifier } from "./rpc-interface";

export interface SessionService {
	login(
		username: string,
		password: string,
		signal: AbortSignal,
	): Promise<string>;
	ping(): boolean;
	readonly version: string;
}

export interface ClientEvents {
	changed(key: string): void;
}

export const ISession: ServiceIdentifier<SessionService> = Symbol("ISession");
export const IClientEvents: ServiceIdentifier<ClientEvents> =
	"client-events.v1";

export const sessionService: SessionService = {
	version: "1.0.0",
	async login(username, _password, signal) {
		signal.throwIfAborted();
		return username;
	},
	ping() {
		return true;
	},
};

export const clientEvents: ClientEvents = {
	changed(key) {
		console.log("Client event", key);
	},
};

export const remoteSessionOptions = {
	wireName: "example.session.v1",
	methods: {
		login: { type: "unary", cancelable: true },
		ping: { type: "unary" },
	},
} as const;

export const remoteClientEventsOptions = {
	methods: { changed: true },
} as const;
