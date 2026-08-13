/**
 * @overview 仅用于原型验证——直接异步任务候选共用的远程服务描述符。
 *
 * Connector 与 Acceptor 用法共享同一组不可变描述符，确保两种拓扑检验的是
 * 同一份线上契约。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import {
	IClientEvents,
	ISession,
	remoteClientEventsOptions,
	remoteSessionOptions,
} from "../fixtures";
import { createRemoteServiceIdentifier } from "./rpc-interface";

export const RemoteSession = createRemoteServiceIdentifier(
	ISession,
	remoteSessionOptions,
);

export const RemoteClientEvents = createRemoteServiceIdentifier(
	IClientEvents,
	remoteClientEventsOptions,
);
