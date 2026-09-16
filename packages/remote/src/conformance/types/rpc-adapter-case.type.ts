/**
 * @overview Shared private Adapter fixture instances and opened Connection test handles.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import type {
	IRpcAcceptorAdapterConformanceFixture,
	IRpcAdapterConformanceRemote,
	IRpcConnectorAdapterConformanceFixture,
} from "@/conformance/rpc-conformance.interface";
import type { IRpcConnection } from "@/modules/transport";

export type ConnectorFixture = Awaited<
	ReturnType<IRpcConnectorAdapterConformanceFixture["create"]>
>;
export type AcceptorFixture = Awaited<
	ReturnType<IRpcAcceptorAdapterConformanceFixture["create"]>
>;
export type OpenedConnection = {
	readonly connection: IRpcConnection;
	readonly remote: IRpcAdapterConformanceRemote;
	finish(): Promise<void>;
};
