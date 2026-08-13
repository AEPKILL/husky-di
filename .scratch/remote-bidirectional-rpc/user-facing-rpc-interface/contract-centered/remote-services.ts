/**
 * @overview 仅供原型验证——以契约为中心的共用远端服务描述符。
 *
 * 本文件只保存 Connector 与 Acceptor 共用的不可变 contract，不持有服务目录、
 * topology、adapter 或服务实现的生命周期。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import { ISession, remoteSessionOptions } from "../fixtures";
import { ContractCentered } from "../public-interface";

export const remoteSession = ContractCentered.createRemoteContract(
	ISession,
	remoteSessionOptions,
);
