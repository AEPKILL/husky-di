/**
 * @overview Cooperative report controls, source excerpt, and current business pause scope.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { ChevronDown, Pause, Play, Square } from "lucide-react";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import { RecordProperty } from "@/web/components/devtools/record-property";
import { Button } from "@/web/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/web/components/ui/resizable";
import type { RenderDevtoolsOptions } from "@/web/types/devtools.type";

export function SourcesPanel(
	options: RenderDevtoolsOptions & {
		readonly vertical: boolean;
		readonly onDebug: (action: string) => void;
	},
) {
	const paused = options.server?.pausedReports.find(
		(report) => report.traceId === options.reportTrace,
	);
	const call = options.calls.find(
		(entry) =>
			entry.side === LabSideEnum.browser &&
			entry.traceId === options.reportTrace,
	);
	return (
		<div className="sources-panel">
			<div className="source-toolbar">
				<Button
					variant="outline"
					data-debug="pause"
					onClick={() => options.onDebug("pause")}
				>
					<Pause aria-hidden="true" />
					Start and Pause Report
				</Button>
				<Button
					variant="outline"
					data-debug="resume"
					disabled={!options.pauseRequested && !paused}
					onClick={() => options.onDebug("resume")}
				>
					<Play aria-hidden="true" />
					Continue Handler
				</Button>
				<Button
					variant="outline"
					data-debug="cancel"
					disabled={
						!options.calls.some(
							(record) =>
								record.traceId === options.reportTrace &&
								record.side === LabSideEnum.browser &&
								record.outcome === "pending",
						)
					}
					onClick={() => options.onDebug("cancel")}
				>
					<Square aria-hidden="true" />
					Cancel Call Wait
				</Button>
				<span className="muted">
					Business cooperative pause point · not a V8/CDP breakpoint
				</span>
			</div>
			<ResizablePanelGroup
				id="sources-panels"
				className="source-grid"
				orientation={options.vertical ? "vertical" : "horizontal"}
			>
				<ResizablePanel id="sources-code" defaultSize="68%" minSize="20%">
					<section className="source-pane">
						<div className="source-file">
							lab-host.factory.ts / actual report handler excerpt
						</div>
						<div className={paused ? "pause-banner paused" : "pause-banner"}>
							{paused ? (
								<Pause aria-hidden="true" />
							) : (
								<Play aria-hidden="true" />
							)}
							{paused
								? "Paused · report-ready · handler still consumes execution budget"
								: "Cooperative checkpoint · Start and pause to inspect real state"}
						</div>
						<pre className="source-code">{options.source}</pre>
						<p className="inspector-note">
							Source excerpt from the sample business handler. Pause does not
							freeze RPC cancellation, recovery, or shutdown.
						</p>
					</section>
				</ResizablePanel>
				<ResizableHandle
					withHandle
					data-resize="sources"
					aria-label="Resize Sources panel"
				/>
				<ResizablePanel id="sources-scope" defaultSize="32%" minSize="20%">
					<aside className="inspector">
						<div className="inspector-title">
							<ChevronDown aria-hidden="true" />
							Scope / Current business pause point
						</div>
						<div className="detail-body">
							{[
								["traceId", options.reportTrace ?? "—"],
								["phase", paused ? "paused" : "running / settled / idle"],
								["signal.aborted", paused ? String(paused.aborted) : "—"],
								["caller outcome", call?.outcome ?? "not started"],
								["peer", paused?.peerId ?? "—"],
							].map(([name, value]) => (
								<RecordProperty key={name} name={name} value={value} />
							))}
						</div>
						<p className="inspector-note">
							Cancellation can settle the caller outcome first. Continuing the
							handler cannot turn an already settled canceled result into
							fulfilled.
						</p>
					</aside>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
