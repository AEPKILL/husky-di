/**
 * @overview 仅用于原型验证——改良后的根对象中心 Connector 真实用法。
 *
 * 本文件只展示主动拓扑：首次连接前的代理、首次失败后的重试、取消、物理连接
 * 恢复，以及局部和聚合释放。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import { clientEvents } from "../fixtures";
import type { IRpcConnectorAdapter } from "../public-interface";
import { RpcError, RpcErrorCodeEnum } from "../public-interface";
import { RemoteClientEvents, RemoteSession } from "./remote-services";
import { RefinedRoot } from "./rpc-interface";

/** 一个同时向远程服务器暴露回调的桌面客户端。 */
export async function desktopClientUsage(
	adapter: IRpcConnectorAdapter,
	/** 测试编排：新的物理连接可建立后完成。 */
	transportAvailableAfterDrop: Promise<void>,
): Promise<void> {
	const rpc = RefinedRoot.createRpc();
	const stopClientEvents = rpc.expose(RemoteClientEvents, clientEvents);
	const connector = rpc.createConnector(adapter);

	// 代理的创建是同步的，而且在首次连接前安全可用。
	const session = connector.peer.resolve(RemoteSession);

	try {
		try {
			await connector.connect();
		} catch (firstFailure) {
			console.warn("Initial RPC connection failed; retrying", firstFailure);

			// 一次连接失败不需要重新创建连接器、对等端或代理对象。
			await connector.connect();
		}

		const controller = new AbortController();
		const pendingLogin = session.login(
			"alice",
			"correct horse battery staple",
			controller.signal,
		);
		controller.abort("The sign-in screen was closed");

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

		await transportAvailableAfterDrop;
		await connector.connect();

		// 这仍然是首次连接前获取的代理，而不是新代理。
		await session.ping();
	} finally {
		// 当该拓扑比根对象更早结束时，可以进行细粒度清理。
		stopClientEvents();
		connector.dispose();
		rpc.dispose();
	}
}

/** 释放指定资源，同时保持同级逻辑会话可用。 */
export async function refinedRootLocalDisposalUsage(
	firstAdapter: IRpcConnectorAdapter,
	secondAdapter: IRpcConnectorAdapter,
): Promise<void> {
	const rpc = RefinedRoot.createRpc();
	const unexpose = rpc.expose(RemoteClientEvents, clientEvents);
	const first = rpc.createConnector(firstAdapter);
	const second = rpc.createConnector(secondAdapter);

	try {
		await Promise.all([first.connect(), second.connect()]);
		first.dispose();
		unexpose();

		// 上面的局部清理不会释放同级拓扑。
		await second.peer.resolve(RemoteSession).ping();
	} finally {
		// 聚合释放会清理所有剩余的拓扑与服务暴露状态，
		// 但不会释放借用的实现，也不会释放由适配器拥有的外部服务器。
		rpc.dispose();
	}
}
