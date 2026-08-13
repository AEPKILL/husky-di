/**
 * @overview 仅用于原型——RPC 用法比较所共用的服务。
 *
 * 这些值让每个用法示例专注于其公开 API 形态，同时各草案仍自行构造远程
 * descriptor。
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import type { ServiceIdentifier } from "./public-interface";

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
		ping: true,
	},
} as const;

export const remoteClientEventsOptions = {
	methods: { changed: true },
} as const;
