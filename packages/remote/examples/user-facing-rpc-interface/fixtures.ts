/**
 * @overview Shared business fixtures for the RPC Interface throwaway prototype.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";
import type { IRpcProtocol } from "@husky-di/remote";

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
		login: { cancelable: true },
		ping: true,
	},
} as const;

export const remoteClientEventsOptions = {
	wireName: "example.client-events.v1",
	methods: { changed: true },
} as const;

/** Supplied by a separate custom Protocol package in the real caller workflow. */
export declare const customProtocol: IRpcProtocol;
