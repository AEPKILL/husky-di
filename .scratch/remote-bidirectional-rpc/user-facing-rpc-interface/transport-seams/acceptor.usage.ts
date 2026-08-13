/**
 * @overview 仅用于原型验证——Acceptor adapter 的监听与连接所有权用法。
 *
 * 本文件只调用被动监听成员，并明确展示 listener 与已接收连接各自的释放责任。
 *
 * @author AEPKILL
 * @created 2026-08-13 22:55:37
 */

import type { IDisposable, IRpcAcceptorAdapter } from "./rpc-interface";

/**
 * 启动被动监听，在监听就绪期间运行场景，并分别释放已接收连接和 listener。
 */
export async function runAcceptorLifecycle<Physical extends IDisposable>(
	acceptor: IRpcAcceptorAdapter<Physical>,
	whileListening: () => Promise<void>,
): Promise<void> {
	const accepted: Physical[] = [];
	const listener = acceptor.listen((connection) => {
		// 同步且不抛异常的回调会在返回前接管所有权。
		accepted.push(connection);
	});

	try {
		await listener.ready;
		await whileListening();
	} finally {
		for (const connection of accepted) {
			connection.dispose();
		}
		listener.dispose();
		await listener.closed;
	}
}
