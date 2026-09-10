/**
 * @overview Composes the React business workspace and shadcn bottom dock.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { BusinessWorkspace } from "@/web/components/business-workspace";
import { DevtoolsDock } from "@/web/components/devtools-dock";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/web/components/ui/resizable";
import { WorkbenchHeader } from "@/web/components/workbench-header";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function Workbench({
	texts,
	scenario,
	peerId,
	transportStatus,
	unavailable,
	reportBusy,
	reportCancelable,
	reportResumable,
	capacityPending,
	greetings,
	devtools,
	onAction,
	onSubmit,
	onViewChange,
	onDebug,
}: WorkbenchProps) {
	const { entries, server } = devtools;
	const transportSummary = entries
		.filter((entry) => entry.source === "TRANSPORT")
		.slice(-5)
		.map((entry) => `${entry.side} · ${entry.summary}`)
		.join("\n");
	return (
		<div className="workbench-shell">
			<WorkbenchHeader
				texts={texts}
				transportStatus={transportStatus}
				onAction={onAction}
			/>
			<main>
				<ResizablePanelGroup orientation="vertical" className="workspace-split">
					<ResizablePanel id="business" defaultSize="45%" minSize="18%">
						<BusinessWorkspace
							texts={texts}
							scenario={scenario}
							peerId={peerId}
							unavailable={unavailable}
							reportBusy={reportBusy}
							reportCancelable={reportCancelable}
							reportResumable={reportResumable}
							capacityPending={capacityPending}
							greetings={greetings}
							onAction={onAction}
							onSubmit={onSubmit}
							server={server}
							transportSummary={transportSummary}
						/>
					</ResizablePanel>
					<ResizableHandle
						withHandle
						aria-label="调整 DevTools 高度"
						data-resize="dock"
					/>
					<ResizablePanel id="devtools" defaultSize="55%" minSize="30%">
						<DevtoolsDock
							texts={texts}
							devtools={devtools}
							onAction={onAction}
							onViewChange={onViewChange}
							onDebug={onDebug}
						/>
					</ResizablePanel>
				</ResizablePanelGroup>
			</main>
		</div>
	);
}
