/**
 * @overview Composes persistent React DevTools panels from bounded application recordings.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { useSyncExternalStore } from "react";
import { ConsolePanel } from "@/web/components/devtools/console-panel";
import { FlowPanel } from "@/web/components/devtools/flow-panel";
import { NetworkPanel } from "@/web/components/devtools/network-panel";
import { ServicesPanel } from "@/web/components/devtools/services-panel";
import { SourcesPanel } from "@/web/components/devtools/sources-panel";
import { TabsContent } from "@/web/components/ui/tabs";
import { DevtoolsPanelEnum } from "@/web/enums/devtools.enum";
import type {
	DevtoolsView,
	RenderDevtoolsOptions,
} from "@/web/types/devtools.type";
import { formatDevtoolsService } from "@/web/utils/format-devtools-service.util";
import { getCallRecordKey } from "@/web/utils/get-call-record-key.util";
import { selectNetworkRecords } from "@/web/utils/select-network-records.util";

export type { DevtoolsView, RenderDevtoolsOptions };

export function Devtools(
	options: RenderDevtoolsOptions & {
		readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
		readonly onDebug: (action: string) => void;
	},
) {
	const { view, calls, onViewChange } = options;
	const vertical = useSyncExternalStore(
		subscribeToViewport,
		isNarrowViewport,
		() => false,
	);
	const network = selectNetworkRecords(options);
	const filtered = calls.filter((call) => {
		const nameMatches =
			`${call.service}.${call.method} ${formatDevtoolsService(call.service)}.${call.method}`
				.toLowerCase()
				.includes(view.filter.toLowerCase());
		const sideMatches = view.side === "all" || call.side === view.side;
		const outcomeMatches =
			view.status === "all" ||
			(view.status === "failed"
				? !["pending", "fulfilled"].includes(call.outcome)
				: call.outcome === view.status);
		return nameMatches && sideMatches && outcomeMatches;
	});
	const networkCalls = new Set(network.calls);
	const filteredNetwork = filtered.filter((call) => networkCalls.has(call));
	const selected =
		calls.find((call) => getCallRecordKey(call) === view.selected) ??
		filtered[0];
	const selectedNetwork =
		network.calls.find((call) => getCallRecordKey(call) === view.selected) ??
		filteredNetwork[0];
	return (
		<>
			<TabsContent
				value={DevtoolsPanelEnum.network}
				forceMount
				className="devtools-panel"
				hidden={view.panel !== DevtoolsPanelEnum.network}
				aria-label="Network"
			>
				<NetworkPanel
					calls={filteredNetwork}
					entries={network.entries}
					selected={selectedNetwork}
					view={view}
					vertical={vertical}
					onViewChange={onViewChange}
				/>
			</TabsContent>
			<TabsContent
				value={DevtoolsPanelEnum.flow}
				forceMount
				className="devtools-panel"
				hidden={view.panel !== DevtoolsPanelEnum.flow}
				aria-label="Flow"
			>
				<FlowPanel
					calls={calls}
					call={selected}
					payload={view.payload}
					vertical={vertical}
				/>
			</TabsContent>
			<TabsContent
				value={DevtoolsPanelEnum.sources}
				forceMount
				className="devtools-panel"
				hidden={view.panel !== DevtoolsPanelEnum.sources}
				aria-label="Sources"
			>
				<SourcesPanel {...options} vertical={vertical} />
			</TabsContent>
			<TabsContent
				value={DevtoolsPanelEnum.services}
				forceMount
				className="devtools-panel"
				hidden={view.panel !== DevtoolsPanelEnum.services}
				aria-label="Services"
			>
				<ServicesPanel server={options.server} />
			</TabsContent>
			<TabsContent
				value={DevtoolsPanelEnum.console}
				forceMount
				className="devtools-panel console-panel"
				hidden={view.panel !== DevtoolsPanelEnum.console}
				aria-label="Console"
			>
				<ConsolePanel {...options} />
			</TabsContent>
		</>
	);
}

export { DevtoolsConsole } from "@/web/components/devtools/console-panel";
export {
	DevtoolsDetailEnum,
	DevtoolsPanelEnum,
} from "@/web/enums/devtools.enum";
export { getCallRecordKey as recordKey } from "@/web/utils/get-call-record-key.util";

function subscribeToViewport(onChange: () => void): () => void {
	const media = window.matchMedia("(max-width: 736px)");
	media.addEventListener("change", onChange);
	return () => media.removeEventListener("change", onChange);
}

function isNarrowViewport(): boolean {
	return window.matchMedia("(max-width: 736px)").matches;
}
