/**
 * @overview 仅用于原型验证——立即启动的 RPC Acceptor 真实用法。
 *
 * 本文件只展示被动拓扑：启动期间安装的新对等端回调、就绪和后续故障、定向调用、
 * 并发广播、成员快照，以及局部和聚合释放。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import { sessionService } from "../fixtures";
import type { IRpcAcceptorAdapter } from "../public-interface";
import { RpcBatchResultStatusEnum } from "../public-interface";
import { RemoteClientEvents, RemoteSession } from "./remote-services";
import { createRpc } from "./rpc-interface";

/** 被动端应用：启动回调消除了首个对端的竞态窗口。 */
export async function passiveEagerAcceptorUsage(
	acceptorAdapter: IRpcAcceptorAdapter,
	/** 广播执行期间，成员关系发生变化后兑现。 */
	peerMembershipChanged: Promise<void>,
): Promise<void> {
	const rpc = createRpc();
	// 即使远程调用方省略生成的可选取消参数，本地处理程序仍会收到其必需的 signal。
	rpc.expose(RemoteSession, sessionService);

	const acceptor = rpc.listen(acceptorAdapter, (peer) => {
		void peer
			.resolve(RemoteClientEvents)
			.changed("welcome")
			.catch((error) => {
				console.warn("Could not welcome the new client", error);
			});
	});
	const allClients = acceptor.resolveAll(RemoteClientEvents);
	// 在就绪前也观察关闭状态，避免启动拒绝留下第二个未处理的被拒 Promise。
	void acceptor.closed.catch(reportListenerFailure);

	try {
		await acceptor.ready;

		const firstClient = acceptor.peers[0];
		if (firstClient) {
			await firstClient.resolve(RemoteClientEvents).changed("one");
		}

		const pendingResults = allClients.changed("all");
		await peerMembershipChanged;
		// 成员关系变化不会改变调用时创建的对端快照。
		const results = await pendingResults;
		for (const result of results) {
			if (result.status === RpcBatchResultStatusEnum.fulfilled) {
				console.log(result.peer, result.value);
			} else {
				console.warn(result.peer, result.reason.code);
			}
		}

		// 当此接收器必须停止，而 RPC 根拥有的其他连接和公开服务仍需保持活动时，
		// 可以单独释放此接收器。
		acceptor.dispose();
	} finally {
		rpc.dispose();
	}
}

function reportListenerFailure(error: Error): void {
	console.error("RPC listener failed", error);
}
