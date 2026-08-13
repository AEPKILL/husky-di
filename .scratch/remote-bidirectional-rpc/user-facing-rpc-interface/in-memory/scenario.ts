/**
 * @overview 仅供原型验证——编排彼此独立的内存 Connector 与 Acceptor usage。
 *
 * 本文件只负责创建成对 adapter 和协调生命周期，不直接使用 Connector 或 Acceptor。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:20:00
 */

import { createMemoryRpcAdapterPair } from "../public-interface";
import { inMemoryAcceptorUsage } from "./acceptor.usage";
import { inMemoryConnectorUsage } from "./connector.usage";

export async function inMemoryUsage(): Promise<void> {
	const adapters = createMemoryRpcAdapterPair();
	let markAcceptorReady: (() => void) | undefined;
	let markConnectorDone: (() => void) | undefined;
	const acceptorReady = new Promise<void>((resolve) => {
		markAcceptorReady = resolve;
	});
	const connectorDone = new Promise<void>((resolve) => {
		markConnectorDone = resolve;
	});

	await Promise.all([
		inMemoryAcceptorUsage(
			adapters.acceptorAdapter,
			() => markAcceptorReady?.(),
			connectorDone,
		),
		(async () => {
			await acceptorReady;
			try {
				await inMemoryConnectorUsage(adapters.connectorAdapter);
			} finally {
				markConnectorDone?.();
			}
		})(),
	]);
}
