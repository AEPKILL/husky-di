/**
 * @overview 仅用于原型验证——直接异步 RPC 任务的 Connector 真实用法。
 *
 * 本文件只展示主动拓扑：首次成功后取得对等端、首次失败后的整任务重试、取消、
 * 隐式物理连接恢复，以及局部和聚合释放。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import { clientEvents, sessionService } from "../fixtures";
import type { IRpcConnectorAdapter } from "../public-interface";
import { RpcError, RpcErrorCodeEnum } from "../public-interface";
import { RemoteClientEvents, RemoteSession } from "./remote-services";
import type { IRpcPeer } from "./rpc-interface";
import { createRpc } from "./rpc-interface";

/**
 * 主动端：服务暴露与连接方向无关，因此服务端可以通过同一逻辑会话调用此客户端。
 */
export async function activeDirectTaskUsage(
	connectorAdapter: IRpcConnectorAdapter,
	/** 测试编排：后续物理连接接入后兑现。 */
	logicalSessionRestoredAfterDrop: Promise<void>,
): Promise<void> {
	const rpc = createRpc();
	rpc.expose(RemoteClientEvents, clientEvents);

	try {
		// 首次 I/O 尚未完成时，对等端及其代理都不存在。
		const peer = await rpc.connect(connectorAdapter);
		const session = peer.proxy(RemoteSession);

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

		// 没有可用于请求恢复的 Connector，因此对等端必须在内部恢复其物理连接。
		// 此处仍然使用原有代理。
		await session.ping();
	} finally {
		// 根对象拥有其服务暴露，以及它创建的每个对等端和监听器。
		rpc.dispose();
	}
}

/**
 * 首次失败体现了将 connect 本身作为任务的代价。
 *
 * 调用被拒绝时不会返回对等端所有者，因此重试意味着重新调用整个操作。只有某次
 * 尝试成功后，代理才可能存在。
 */
export async function initialConnectionRetryUsage(
	connectorAdapter: IRpcConnectorAdapter,
): Promise<void> {
	const rpc = createRpc();
	let peer: IRpcPeer;

	try {
		try {
			peer = await rpc.connect(connectorAdapter);
		} catch (error) {
			console.warn("Initial RPC connection failed; retrying", error);
			peer = await rpc.connect(connectorAdapter);
		}

		// 不存在可跨越失败尝试而保持稳定的连接前代理；只能从成功连接的对等端取得代理。
		const session = peer.proxy(RemoteSession);
		await session.ping();
	} finally {
		rpc.dispose();
	}
}

/** 停止选定资源，而不关闭整个 RPC 根对象。 */
export async function localDisposalUsage(
	firstConnectorAdapter: IRpcConnectorAdapter,
	secondConnectorAdapter: IRpcConnectorAdapter,
): Promise<void> {
	const rpc = createRpc();
	const unexpose = rpc.expose(RemoteSession, sessionService);

	try {
		const firstPeer = await rpc.connect(firstConnectorAdapter);
		const secondPeer = await rpc.connect(secondConnectorAdapter);

		firstPeer.dispose();
		unexpose();

		// 局部清理不会释放由根对象拥有的无关对等端。
		await secondPeer.proxy(RemoteSession).ping();
	} finally {
		// 聚合清理涵盖剩余的拓扑与服务暴露状态，但不处理借用的实现，也不处理
		// 由适配器拥有的外部服务器。
		rpc.dispose();
	}
}
