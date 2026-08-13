/**
 * @overview 仅用于原型验证——固定 transport topology 的高层场景编排。
 *
 * 场景只组合 Connector 与 Acceptor 的高层 usage，不直接调用任一 adapter 的
 * `connect()`、`listen()` 或 listener 生命周期成员。
 *
 * @author AEPKILL
 * @created 2026-08-13 22:55:37
 */

import { runAcceptorLifecycle } from "./acceptor.usage";
import { runConnectorLifecycle } from "./connector.usage";
import type { IAdapterPair, IDisposable } from "./rpc-interface";

/** 可针对任意一种物理连接候选方案进行编译检查的固定拓扑。 */
export async function runFixedTopology<Physical extends IDisposable>(
	adapters: IAdapterPair<Physical>,
	consume: (connection: Physical) => Promise<void>,
): Promise<void> {
	await runAcceptorLifecycle(adapters.acceptor, () =>
		runConnectorLifecycle(adapters.connector, consume),
	);
}
