/**
 * @overview Connection activation capability at the synchronous ownership handoff.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { IRpcConnection } from "@husky-di/remote/transport";
import type {
	IWebSocketLike,
	IWebSocketNetworkStatus,
	IWebSocketTransportLimits,
} from "@/shared/interfaces/web-socket-platform.interface";

export interface IWebSocketConnection extends IRpcConnection {
	activate(): void;
}
export type WebSocketConnectionFactory = (options: {
	readonly socket: IWebSocketLike;
	readonly limits: IWebSocketTransportLimits;
	readonly networkStatus?: IWebSocketNetworkStatus;
	readonly onCleanup?: () => void;
}) => IWebSocketConnection;
