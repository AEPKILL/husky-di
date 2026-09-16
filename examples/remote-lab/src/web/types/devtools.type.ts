/**
 * @overview Shared view state and recorded inputs consumed by the Lab DevTools panels.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import type { LabSideEnum } from "@/enums/lab-recording.enum";
import type { ILabCustomServices } from "@/interfaces/lab-custom-services.interface";
import type { LabBrowserOwnerSnapshot } from "@/types/lab-owner.type";
import type { LabCallRecord, LabLogEntry } from "@/types/lab-recording.type";
import type { LabServerSnapshot } from "@/types/lab-server.type";
import type {
	NodeDiagnosticsSnapshot,
	RpcDiagnosticsSnapshot,
} from "@/types/rpc-diagnostics.type";
import type {
	DevtoolsDetailEnum,
	DevtoolsNetworkViewEnum,
	DevtoolsPanelEnum,
	DevtoolsTimeSortEnum,
} from "@/web/enums/devtools.enum";

export type DevtoolsView = {
	panel: DevtoolsPanelEnum;
	detail: DevtoolsDetailEnum;
	selected: string | undefined;
	filter: string;
	side: string;
	status: string;
	networkDirection?: string;
	networkTimeSort?: DevtoolsTimeSortEnum;
	networkView?: DevtoolsNetworkViewEnum;
	returnToServices?: boolean;
	payload: boolean;
};

export type RenderDevtoolsOptions = {
	readonly view: DevtoolsView;
	readonly clearingRecords: boolean;
	readonly peerId: string | undefined;
	readonly sessionId: string | undefined;
	readonly calls: readonly LabCallRecord[];
	readonly entries: readonly (LabLogEntry & { readonly side: LabSideEnum })[];
	readonly server: LabServerSnapshot | undefined;
	readonly reportTrace: string | undefined;
	readonly pauseRequested: boolean;
	readonly source: string;
	readonly browserDiagnostics: RpcDiagnosticsSnapshot;
	readonly nodeDiagnostics: NodeDiagnosticsSnapshot | undefined;
	readonly browserOwner: LabBrowserOwnerSnapshot;
	readonly nodeObservation: string;
	readonly browserCustomServices?: ILabCustomServices;
	readonly nodePollingStopped?: boolean;
};
