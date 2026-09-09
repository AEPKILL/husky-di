/**
 * @overview Small event collector boundary shared by browser and Node.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { RpcEvent } from "@husky-di/remote";
import type { RpcDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";

export interface IRpcDiagnostics {
	record(event: RpcEvent): void;
	snapshot(): RpcDiagnosticsSnapshot;
}
