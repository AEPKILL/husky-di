/**
 * @overview 仅用于原型验证——直接异步 RPC 任务的 Acceptor 真实用法。
 *
 * 本文件只展示被动拓扑：启动期间安装的新对等端回调、后续监听故障、定向调用、
 * 并发广播、成员快照，以及聚合释放。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import { sessionService } from "../fixtures";
import type { IRpcAcceptorAdapter } from "../public-interface";
import { RpcBatchResultStatusEnum } from "../public-interface";
import { RemoteClientEvents, RemoteSession } from "./remote-services";
import { createRpc } from "./rpc-interface";

/**
 * 被动端：回调必须传给 listen，确保异步启动期间接受的对等端不会先于通知机制到达。
 */
export async function passiveDirectTaskUsage(
	acceptorAdapter: IRpcAcceptorAdapter,
	/** 广播尚在进行时，对等端成员关系发生变化后兑现。 */
	peerMembershipChanged: Promise<void>,
): Promise<void> {
	const rpc = createRpc();
	// 处理器接收必填的 signal；生成的调用端参数则为可选，因为是否取消由调用方决定。
	rpc.expose(RemoteSession, sessionService);

	try {
		// 在此 Promise 兑现前，没有可用于读取对等端、创建全体对等端代理或观察
		// closed 状态的监听器。在此处传入回调，是本候选方案唯一不存在竞态的
		// 新对等端通知方式。
		const listener = await rpc.listen(acceptorAdapter, (peer) => {
			// 每个新逻辑会话调用一次；该会话使用替代物理连接时不会再次调用。
			void peer
				.proxy(RemoteClientEvents)
				.changed("welcome")
				.catch((error) => {
					console.warn("Could not welcome the new client", error);
				});
		});

		// 启动成功后，后续监听器故障仍然可观察。
		void listener.closed.catch(reportListenerFailure);

		const firstClient = listener.peers[0];
		if (firstClient) {
			await firstClient.proxy(RemoteClientEvents).changed("one");
		}

		const allClients = listener.all(RemoteClientEvents);
		const pendingResults = allClients.changed("all");
		await peerMembershipChanged;
		// 成员关系变化不会改变调用时捕获的对等端快照。
		const results = await pendingResults;
		for (const result of results) {
			if (result.status === RpcBatchResultStatusEnum.fulfilled) {
				console.log("Client acknowledged change", result.peer, result.value);
			} else {
				// 单个拒绝属于结果数据，不会导致广播本身被拒绝。
				console.warn("Client change failed", result.peer, result.reason.code);
			}
		}
	} finally {
		// 聚合释放会关闭监听器及其接受的所有对等端。
		rpc.dispose();
	}
}

function reportListenerFailure(error: Error): void {
	console.error("RPC listener failed", error);
}
