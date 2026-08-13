/**
 * @overview 仅供原型验证——内存 adapter 的 Acceptor 用法。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:20:00
 */

import { sessionService } from "../fixtures";
import { RootCentered } from "../public-interface";
import { RemoteSession } from "./remote-services";

export async function inMemoryAcceptorUsage(
	adapter: RootCentered.RpcAcceptorAdapter,
	ready: () => void,
	completed: Promise<void>,
): Promise<void> {
	const rpc = RootCentered.createRpc();
	rpc.expose(RemoteSession, sessionService);
	const acceptor = rpc.acceptor(adapter);

	try {
		await acceptor.listen();
		ready();
		await completed;
	} finally {
		rpc.dispose();
	}
}
