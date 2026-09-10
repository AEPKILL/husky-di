/**
 * @overview Shared view state and recorded inputs consumed by the Lab DevTools panels.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { LabSideEnum } from "@/enums/lab-recording.enum";
import type { LabCallRecord, LabLogEntry } from "@/types/lab-recording.type";
import type { LabServerSnapshot } from "@/types/lab-server.type";
import type { RpcDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";
import type {
	DevtoolsDetailEnum,
	DevtoolsPanelEnum,
} from "@/web/enums/devtools.enum";

export type DevtoolsView = {
	panel: DevtoolsPanelEnum;
	detail: DevtoolsDetailEnum;
	selected: string | undefined;
	filter: string;
	side: string;
	status: string;
	payload: boolean;
};

export type RenderDevtoolsOptions = {
	readonly view: DevtoolsView;
	readonly calls: readonly LabCallRecord[];
	readonly entries: readonly (LabLogEntry & { readonly side: LabSideEnum })[];
	readonly server: LabServerSnapshot | undefined;
	readonly reportTrace: string | undefined;
	readonly pauseRequested: boolean;
	readonly source: string;
	readonly browserDiagnostics: RpcDiagnosticsSnapshot;
	readonly nodeDiagnostics: RpcDiagnosticsSnapshot | undefined;
};
