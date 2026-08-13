/**
 * @overview 仅供原型验证——函数式接缝方案共用的远端服务描述符。
 *
 * 本文件只保存 Connector 与 Acceptor 共用的不可变 descriptor，不持有 exposure、
 * topology、adapter 或服务实现的生命周期。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import { ISession, remoteSessionOptions } from "../fixtures";
import { FunctionalSeams } from "../public-interface";

export const remoteSession = FunctionalSeams.createRemoteServiceIdentifier(
	ISession,
	remoteSessionOptions,
);
