/**
 * @overview 仅供原型验证——以 RPC 根对象为中心的共用远端服务描述符。
 *
 * 本文件只保存 Connector 与 Acceptor 共用的不可变 descriptor，不持有任何
 * RPC、topology、adapter 或服务实现的生命周期。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import {
	IClientEvents,
	ISession,
	remoteClientEventsOptions,
	remoteSessionOptions,
} from "../fixtures";
import { RootCentered } from "../public-interface";

export const remoteSession = RootCentered.createRemoteServiceIdentifier(
	ISession,
	remoteSessionOptions,
);

export const remoteClientEvents = RootCentered.createRemoteServiceIdentifier(
	IClientEvents,
	remoteClientEventsOptions,
);
