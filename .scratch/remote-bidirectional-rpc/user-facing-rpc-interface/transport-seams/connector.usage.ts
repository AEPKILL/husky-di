/**
 * @overview 仅用于原型验证——Connector adapter 的连接、取消与所有权用法。
 *
 * 本文件只调用主动建连成员；Acceptor 的监听与已接收连接所有权在独立文件中展示。
 *
 * @author AEPKILL
 * @created 2026-08-13 22:55:37
 */

import type { IDisposable, IRpcConnectorAdapter } from "./rpc-interface";

/** 在真实 connector 调用尚未完成时将其取消。 */
export async function runCanceledConnect<Physical extends IDisposable>(
	connector: IRpcConnectorAdapter<Physical>,
): Promise<Error> {
	const controller = new AbortController();
	const pending = connector.connect(controller.signal);
	controller.abort(new Error("Compile-only connect cancellation"));

	try {
		const connection = await pending;
		connection.dispose();
	} catch (error) {
		if (!(error instanceof Error)) {
			throw new TypeError("Canceled connect must reject with an Error");
		}
		return error;
	}

	throw new Error("Connect fulfilled after cancellation");
}

/** 建立一条主动物理连接，并在消费完成或失败后释放其所有权。 */
export async function runConnectorLifecycle<Physical extends IDisposable>(
	connector: IRpcConnectorAdapter<Physical>,
	consume: (connection: Physical) => Promise<void>,
): Promise<void> {
	const controller = new AbortController();
	let connection: Physical | undefined;

	try {
		connection = await connector.connect(controller.signal);
		await consume(connection);
	} finally {
		connection?.dispose();
	}
}
