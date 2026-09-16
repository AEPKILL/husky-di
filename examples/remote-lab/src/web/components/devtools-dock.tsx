/**
 * @overview DevtoolsDock for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
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
				<nav className="dock-tabs" aria-label="DevTools Panels">
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
					<span className="recording">● Recording</span>
					<label>
						<span className="sr-only">
							Filter messages, calls, or handshakes
						</span>
						<input
							id="call-filter"
							type="search"
							placeholder="Filter messages / calls"
							autoComplete="off"
							value={view.filter}
							onChange={(event) => onViewChange({ filter: event.target.value })}
						/>
					</label>
					<select
						id="side-filter"
						aria-label="Filter by side"
						value={view.side}
						onChange={(event) => onViewChange({ side: event.target.value })}
					>
						<option value="all">All sides</option>
						<option>Browser</option>
						<option>Node</option>
					</select>
					<select
						id="status-filter"
						aria-label="Filter by result"
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
						Show Payload
					</label>
					<Button
						onClick={onAction}
						variant="ghost"
						id="clear-records"
						disabled={devtools.clearingRecords}
						title="Clear Browser and Node call history, handshakes, and events; in-flight calls remain"
					>
						<Trash2 aria-hidden="true" />
						Clear All Records
					</Button>
					<span className="toolbar-note">
						APP sample call · RPC observationId is local to one endpoint
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
						aria-label="Resize Console height"
						data-resize="console"
					/>
					<ResizablePanel id="console-drawer" defaultSize="24%" minSize="10%">
						<div className="console-drawer">
							<div className="drawer-title">
								<Terminal aria-hidden="true" size={13} />
								Console <span className="muted">Recent Records</span>
								<span>
									RPC / APP / TRANSPORT / STREAM · sources are labeled
									separately
								</span>
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
					<span>
						Public events + explicit app instrumentation · real connections
					</span>
				</footer>
			</section>
		</Tabs>
	);
}
