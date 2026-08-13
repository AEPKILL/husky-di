/**
 * @overview 仅供原型验证——内存 Connector 与 Acceptor usage 的公共契约。
 *
 * 这里只共享不可变的远程服务 descriptor。adapter pair、RPC root、Connector、
 * Acceptor 及 exposure 等有生命周期的 owner 不得放入公共模块。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:20:00
 */

import { ISession, remoteSessionOptions } from "../fixtures";
import { RootCentered } from "../public-interface";

export const RemoteSession = RootCentered.createRemoteServiceIdentifier(
	ISession,
	remoteSessionOptions,
);
