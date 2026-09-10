/**
 * @overview Cooperative report controls, source excerpt, and current business pause scope.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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
					启动并暂停报表
				</Button>
				<Button
					variant="outline"
					data-debug="resume"
					disabled={!options.pauseRequested && !paused}
					onClick={() => options.onDebug("resume")}
				>
					<Play aria-hidden="true" />
					继续处理器
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
					取消调用等待
				</Button>
				<span className="muted">业务协作暂停点 · 非 V8/CDP 断点</span>
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
								? "Paused · report-ready · 处理器仍占用执行额度"
								: "Cooperative checkpoint · 启动并暂停后查看真实状态"}
						</div>
						<pre className="source-code">{options.source}</pre>
						<p className="inspector-note">
							源码摘录自示例业务处理器。暂停不冻结 RPC 取消、恢复或关闭。
						</p>
					</section>
				</ResizablePanel>
				<ResizableHandle
					withHandle
					data-resize="sources"
					aria-label="调整 Sources 面板大小"
				/>
				<ResizablePanel id="sources-scope" defaultSize="32%" minSize="20%">
					<aside className="inspector">
						<div className="inspector-title">
							<ChevronDown aria-hidden="true" />
							Scope / 当前业务暂停点
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
							取消可以先确定 caller outcome。继续处理器不能把已经确定的 canceled
							改成 fulfilled。
						</p>
					</aside>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
