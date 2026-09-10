/**
 * @overview DevtoolsDock for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { PanelBottom, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/web/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/web/components/ui/tabs";
import { Devtools, DevtoolsConsole, DevtoolsPanelEnum } from "@/web/devtools";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function DevtoolsDock({
	texts,
	devtools,
	onAction,
	onViewChange,
	onDebug,
}: Pick<
	WorkbenchProps,
	"texts" | "devtools" | "onAction" | "onViewChange" | "onDebug"
>) {
	const { view, calls, entries } = devtools;
	return (
		<Tabs
			asChild
			value={view.panel}
			onValueChange={(panel) =>
				onViewChange({ panel: panel as DevtoolsPanelEnum })
			}
			className="dock-navigation"
		>
			<section className="dock" aria-label="Remote DevTools">
				<nav className="dock-tabs" aria-label="DevTools 面板">
					<strong>
						<PanelBottom aria-hidden="true" size={15} />
						<span>Remote DevTools</span>
					</strong>
					<TabsList variant="line">
						{Object.values(DevtoolsPanelEnum).map((panel) => (
							<TabsTrigger key={panel} value={panel}>
								{panel}
							</TabsTrigger>
						))}
					</TabsList>
					<span className="dock-note">Docked to bottom</span>
				</nav>
				<div className="toolbar">
					<span className="recording">● 记录中</span>
					<label>
						<span className="sr-only">按名称筛选调用</span>
						<input
							id="call-filter"
							type="search"
							placeholder="Filter service / method"
							autoComplete="off"
							value={view.filter}
							onChange={(event) => onViewChange({ filter: event.target.value })}
						/>
					</label>
					<select
						id="side-filter"
						aria-label="按端筛选"
						value={view.side}
						onChange={(event) => onViewChange({ side: event.target.value })}
					>
						<option value="all">All sides</option>
						<option>Browser</option>
						<option>Node</option>
					</select>
					<select
						id="status-filter"
						aria-label="按结果筛选"
						value={view.status}
						onChange={(event) => onViewChange({ status: event.target.value })}
					>
						<option value="all">All outcomes</option>
						<option value="pending">pending</option>
						<option value="fulfilled">fulfilled</option>
						<option value="failed">failed</option>
					</select>
					<label className="check">
						<input
							id="show-payload"
							type="checkbox"
							checked={view.payload}
							onChange={(event) =>
								onViewChange({ payload: event.target.checked })
							}
						/>
						显示示例参数
					</label>
					<Button
						onClick={onAction}
						variant="ghost"
						id="clear-records"
						title="清空浏览器已完成历史；在途调用保留"
					>
						<Trash2 aria-hidden="true" />
						清空本地记录
					</Button>
					<span className="toolbar-note">
						APP 示例调用 · RPC observationId 仅端内关联
					</span>
				</div>
				<ResizablePanelGroup orientation="vertical" className="dock-body">
					<ResizablePanel id="panels" defaultSize="76%" minSize="40%">
						<div id="panel-content" className="panel-content">
							<Devtools
								{...devtools}
								onViewChange={onViewChange}
								onDebug={onDebug}
							/>
						</div>
					</ResizablePanel>
					<ResizableHandle
						withHandle
						aria-label="调整 Console 高度"
						data-resize="console"
					/>
					<ResizablePanel id="console-drawer" defaultSize="24%" minSize="10%">
						<div className="console-drawer">
							<div className="drawer-title">
								<Terminal aria-hidden="true" size={13} />
								Console <span className="muted">最近记录</span>
								<span>RPC / APP / TRANSPORT · 来源分别标识</span>
							</div>
							<div id="console-preview">
								<DevtoolsConsole
									entries={entries.slice(-3)}
									payload={view.payload}
								/>
							</div>
						</div>
					</ResizablePanel>
				</ResizablePanelGroup>
				<footer className="statusbar">
					<span id="call-count">{calls.length} APP records</span>
					<span id="pending-count">
						{calls.filter((call) => call.outcome === "pending").length} pending
					</span>
					<span id="node-state">
						{texts["#node-state"] ?? "Node snapshot…"}
					</span>
					<span>公开事件 + 显式应用插桩 · 真实连接</span>
				</footer>
			</section>
		</Tabs>
	);
}
