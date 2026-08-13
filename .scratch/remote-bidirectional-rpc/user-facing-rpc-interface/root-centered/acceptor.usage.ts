/**
 * @overview 仅供原型验证——以 RPC 根对象为中心的 Acceptor 用法。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import { sessionService } from "../fixtures";
import { RootCentered, RpcBatchResultStatusEnum } from "../public-interface";
import { remoteClientEvents, remoteSession } from "./remote-services";

/**
 * 推荐草案——以 RPC 根对象为中心的被动拓扑
 *
 * RPC 根对象拥有本地服务暴露和 Acceptor；Acceptor 管理所有已接受的 peer。
 */
export async function passiveRootCenteredUsage(
	adapter: RootCentered.RpcAcceptorAdapter,
): Promise<void> {
	const rpc = RootCentered.createRpc();
	rpc.expose(remoteSession, sessionService);
	const acceptor = rpc.acceptor(adapter);
	const allClients = acceptor.resolveAll(remoteClientEvents);
	const offPeer = acceptor.onPeer((peer) => {
		void peer.resolve(remoteClientEvents).changed("welcome");
	});

	try {
		await acceptor.listen();

		const oneClient = acceptor.peers[0];
		if (oneClient) {
			await oneClient.resolve(remoteClientEvents).changed("one");
		}

		const results = await allClients.changed("all");
		for (const result of results) {
			if (result.status === RpcBatchResultStatusEnum.fulfilled) {
				console.log(result.peer, result.value);
			} else {
				console.warn(result.peer, result.reason.code);
			}
		}
	} finally {
		offPeer();
		acceptor.dispose();
		rpc.dispose();
	}
}
