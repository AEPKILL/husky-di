/**
 * @overview Shared connector-termination fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import type { RpcProtocolConnectorFactory } from "../../src/index";

export function createColdProtocol(overrides?: {
	readonly cleanup?: () => Promise<void>;
}): RpcProtocolConnectorFactory {
	return () => ({
		async bind() {},
		async shutdown() {},
		close() {},
		cleanup: overrides?.cleanup ?? (async () => {}),
	});
}
