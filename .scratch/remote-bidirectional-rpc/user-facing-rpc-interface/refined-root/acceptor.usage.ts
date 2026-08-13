/**
 * @overview 仅用于原型验证——改良后的根对象中心 Acceptor 真实用法。
 *
 * 本文件只展示被动拓扑：无竞态的新逻辑会话通知、定向调用、并发广播、成员
 * 快照，以及聚合释放。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:17
 */

import { sessionService } from "../fixtures";
import type { IRpcAcceptorAdapter } from "../public-interface";
import { RpcBatchResultStatusEnum } from "../public-interface";
import { RemoteClientEvents, RemoteSession } from "./remote-services";
import { RefinedRoot } from "./rpc-interface";

/** 一个提供会话服务，并向每个已连接桌面客户端发起调用的服务器。 */
export async function sessionServerUsage(
	adapter: IRpcAcceptorAdapter,
	/** 广播尚在执行时，对等端成员发生变化后完成。 */
	peerMembershipChanged: Promise<void>,
): Promise<void> {
	const rpc = RefinedRoot.createRpc();

	// 处理器始终会收到必填的 AbortSignal，即使调用方可以在生成的远程方法中
	// 省略对应的可选信号。根对象只是借用这个普通的本地实现。
	rpc.expose(RemoteSession, sessionService);

	const acceptor = rpc.createAcceptor(adapter);
	const allClientEvents = acceptor.resolveAll(RemoteClientEvents);

	// 在 `listen()` 前注册，以免错过第一个逻辑会话。
	const stopNewPeerNotifications = acceptor.onPeer((peer) => {
		const clientEvents = peer.resolve(RemoteClientEvents);
		void clientEvents.changed("session-opened").catch((error) => {
			console.warn("Could not welcome the new client", error);
		});
	});

	try {
		await acceptor.listen();

		// 定向调用一个当前已连接的逻辑会话。
		const firstClient = acceptor.peers[0];
		if (firstClient) {
			await firstClient
				.resolve(RemoteClientEvents)
				.changed("permissions-refreshed");
		}

		// 某个对等端失败，不会拒绝其他投递，也不会丢失其结果。
		const pendingDeliveries = allClientEvents.changed("maintenance-scheduled");
		await peerMembershipChanged;
		// 结果仍描述调用 `changed()` 时获取的对等端快照，而快照中的所有调用
		// 都可以并发执行。
		const deliveries = await pendingDeliveries;
		for (const delivery of deliveries) {
			if (delivery.status === RpcBatchResultStatusEnum.fulfilled) {
				console.info("Client notified", delivery.peer);
			} else {
				console.warn(
					"Client notification failed",
					delivery.peer,
					delivery.reason.code,
				);
			}
		}
	} finally {
		// 聚合释放负责清理接收器、对等端、订阅与服务暴露。
		// 它不会释放借用的 `sessionService` 实现。
		rpc.dispose();
		// 在接收器或根对象释放后仍保持幂等，也可用于更早取消订阅。
		stopNewPeerNotifications();
	}
}
