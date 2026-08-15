/**
 * @overview @husky-di/remote 设计示例——IConnection 的完整消息消费方式。
 *
 * @author AEPKILL
 * @created 2026-08-14 23:55:00
 */

import type { Subscription } from "rxjs";

import type { IConnection } from "./rpc-interface";

const PING_MESSAGE = Uint8Array.of(0x70, 0x69, 0x6e, 0x67);
const PONG_MESSAGE = Uint8Array.of(0x70, 0x6f, 0x6e, 0x67);

export async function runConnectionPingPong(
	connection: IConnection,
): Promise<void> {
	let subscription: Subscription | undefined;
	const pong = new Promise<void>((resolve, reject) => {
		let received = false;
		subscription = connection.message$.subscribe({
			next(message) {
				if (received) {
					return;
				}
				received = true;
				try {
					assertPong(message);
					resolve();
				} catch (error) {
					reject(error);
				}
			},
			error: reject,
			complete() {
				if (!received) {
					reject(new Error("Connection closed before pong"));
				}
			},
		});
	});

	try {
		await Promise.all([connection.send(PING_MESSAGE), pong]);
		await connection.close();
	} catch (error) {
		// 取消唯一订阅会让 adapter 在内部中止无法继续使用的连接。
		subscription?.unsubscribe();
		throw error;
	}
}

function assertPong(message: Uint8Array): void {
	if (
		message.length !== PONG_MESSAGE.length ||
		message.some((byte, index) => byte !== PONG_MESSAGE[index])
	) {
		throw new Error("RPC ping received a non-pong message");
	}
}
