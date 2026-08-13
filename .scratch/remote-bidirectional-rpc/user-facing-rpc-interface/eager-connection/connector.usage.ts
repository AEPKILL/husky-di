/**
 * @overview 仅用于原型验证——立即启动的 RPC Connector 真实用法。
 *
 * 本文件只展示主动拓扑：首次连接前的代理、首次失败后重建句柄、取消、隐式物理
 * 连接恢复，以及局部和聚合释放。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import { clientEvents } from "../fixtures";
import type { IRpcConnectorAdapter } from "../public-interface";
import { RpcError, RpcErrorCodeEnum } from "../public-interface";
import { RemoteClientEvents, RemoteSession } from "./remote-services";
import { createRpc } from "./rpc-interface";

/** 主动端应用：首次连接仍在等待时，代理就已经存在。 */
export async function activeEagerConnectionUsage(
	connectorAdapter: IRpcConnectorAdapter,
	/** 测试编排：后续物理连接接入后兑现。 */
	logicalSessionRestoredAfterDrop: Promise<void>,
): Promise<void> {
	const rpc = createRpc();
	rpc.expose(RemoteClientEvents, clientEvents);

	const connector = rpc.connect(connectorAdapter);
	const session = connector.peer.resolve(RemoteSession);

	try {
		await connector.ready;
		await session.ping();

		const controller = new AbortController();
		const pendingLogin = session.login("alice", "secret", controller.signal);
		controller.abort();
		try {
			await pendingLogin;
		} catch (error) {
			if (
				!(error instanceof RpcError) ||
				error.code !== RpcErrorCodeEnum.canceled
			) {
				throw error;
			}
		}

		await logicalSessionRestoredAfterDrop;

		// 替换物理连接不会替换 `connector.peer`，也不会替换已经创建的
		// `session` 代理。
		await session.ping();
	} finally {
		// 默认所有权路径只需聚合释放即可。
		rpc.dispose();
	}
}

/**
 * 启动重试是此候选方案的主要压力点。
 *
 * `ready` 一旦拒绝，此接口就必须让 `connect()` 分配第二个逻辑会话，或为
 * `IRpcConnector` 增加重试成员。目前两者都不存在，因此代码必须重新创建句柄和代理。
 */
export async function activeStartupRetryUsage(
	connectorAdapter: IRpcConnectorAdapter,
): Promise<void> {
	const rpc = createRpc();
	let connector = rpc.connect(connectorAdapter);
	let session = connector.peer.resolve(RemoteSession);

	try {
		try {
			await connector.ready;
		} catch {
			connector.dispose();
			connector = rpc.connect(connectorAdapter);
			session = connector.peer.resolve(RemoteSession);
			await connector.ready;
		}

		await session.ping();
	} finally {
		rpc.dispose();
	}
}

/** 释放选定资源，同时保持同级逻辑会话可用。 */
export async function eagerLocalDisposalUsage(
	firstAdapter: IRpcConnectorAdapter,
	secondAdapter: IRpcConnectorAdapter,
): Promise<void> {
	const rpc = createRpc();
	const unexpose = rpc.expose(RemoteClientEvents, clientEvents);
	const first = rpc.connect(firstAdapter);
	const second = rpc.connect(secondAdapter);

	try {
		await Promise.all([first.ready, second.ready]);
		first.dispose();
		unexpose();

		await second.peer.resolve(RemoteSession).ping();
	} finally {
		// 聚合释放会清理剩余的拓扑和公开服务状态，但不会释放借用的实现，
		// 也不会释放适配器拥有的外部服务器。
		rpc.dispose();
	}
}
