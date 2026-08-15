/**
 * @overview @husky-di/remote 设计示例——Connector 与 Acceptor 共享的远端服务描述。
 *
 * 这里只共享不可变的协议 descriptor；两端各自创建并释放 topology owner。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:20:00
 */

import {
	IClientEvents,
	ISession,
	remoteClientEventsOptions,
	remoteSessionOptions,
} from "../fixtures";
import { createRemoteServiceIdentifier } from "../rpc-interface";

export const remoteSession = createRemoteServiceIdentifier(
	ISession,
	remoteSessionOptions,
);

export const remoteClientEvents = createRemoteServiceIdentifier(
	IClientEvents,
	remoteClientEventsOptions,
);
