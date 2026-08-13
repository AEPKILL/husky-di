/**
 * @overview 仅供原型验证——浏览器 Connector 与 Express Acceptor 共享的远端服务描述。
 *
 * 这里只共享不可变的协议 descriptor；两端各自创建并释放 RPC 与 topology owner。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:20:00
 */

import { ISession, remoteSessionOptions } from "../fixtures";
import { RootCentered } from "../public-interface";

export const remoteSession = RootCentered.createRemoteServiceIdentifier(
	ISession,
	remoteSessionOptions,
);
