/**
 * @overview Switches between Transport/stream messages and application call/lifecycle inspection.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { ChevronDown } from "lucide-react";
import { Fragment, useRef } from "react";
import type { Layout } from "react-resizable-panels";
import type { LabCallRecord } from "@/types/lab-recording.type";
import { EndpointBadge } from "@/web/components/devtools/endpoint-badge";
import { HandshakeDetails } from "@/web/components/devtools/handshake-details";
import { MessagePanel } from "@/web/components/devtools/message-panel";
import { RecordProperty } from "@/web/components/devtools/record-property";
import { Button } from "@/web/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/web/components/ui/resizable";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/web/components/ui/tabs";
import {
	DevtoolsDetailEnum,
	DevtoolsNetworkViewEnum,
	DevtoolsPanelEnum,
} from "@/web/enums/devtools.enum";
import type {
	DevtoolsView,
	RenderDevtoolsOptions,
} from "@/web/types/devtools.type";
import { formatDevtoolsJson } from "@/web/utils/format-devtools-json.util";
import { formatDevtoolsService } from "@/web/utils/format-devtools-service.util";
import { getCallRecordKey } from "@/web/utils/get-call-record-key.util";

export function NetworkPanel(props: {
	readonly calls: readonly LabCallRecord[];
	readonly entries: RenderDevtoolsOptions["entries"];
	readonly selected: LabCallRecord | undefined;
	readonly view: DevtoolsView;
	readonly vertical: boolean;
	readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
}) {
	const mode = props.view.networkView ?? DevtoolsNetworkViewEnum.messages;
	const layouts = useRef<Record<string, Layout>>({});
	const layoutKey = `${mode}:${props.vertical}`;
	const layoutProps = {
		defaultLayout: layouts.current[layoutKey],
		onLayoutChanged: (layout: Layout) => {
			layouts.current[layoutKey] = layout;
		},
	};
	return (
		<div className="network-view">
			<fieldset className="network-view-toolbar" aria-label="Network View">
				{[
					[DevtoolsNetworkViewEnum.messages, "Messages"],
					[DevtoolsNetworkViewEnum.calls, "Call"],
				].map(([value, label]) => (
					<Button
						key={value}
						variant="ghost"
						aria-pressed={mode === value}
						onClick={() =>
							props.onViewChange({
								networkView: value as DevtoolsNetworkViewEnum,
							})
						}
					>
						{label}
					</Button>
				))}
				<span className="muted">
					{mode === DevtoolsNetworkViewEnum.messages
						? "Transport / Stream · Sent / Received"
						: "APP calls · handshake and connection events"}
				</span>
				{props.view.returnToServices ? (
					<Button
						variant="ghost"
						onClick={() =>
							props.onViewChange({
								panel: DevtoolsPanelEnum.services,
								returnToServices: false,
							})
						}
					>
						Back to Custom Experiment
					</Button>
				) : null}
			</fieldset>
			{mode === DevtoolsNetworkViewEnum.messages ? (
				<MessagePanel {...props} {...layoutProps} />
			) : (
				<CallNetworkPanel {...props} {...layoutProps} />
			)}
		</div>
	);
}

function CallNetworkPanel({
	calls,
	entries,
	selected,
	view,
	vertical,
	onViewChange,
	defaultLayout,
	onLayoutChanged,
}: {
	readonly calls: readonly LabCallRecord[];
	readonly entries: RenderDevtoolsOptions["entries"];
	readonly selected: LabCallRecord | undefined;
	readonly view: DevtoolsView;
	readonly vertical: boolean;
	readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
	readonly defaultLayout?: Layout;
	readonly onLayoutChanged?: (layout: Layout) => void;
}) {
	const firstAt = Math.min(...calls.map((call) => call.startedAt));
	const now = Date.now();
	const endAt = Math.max(...calls.map((call) => call.finishedAt ?? now));
	const total = Math.max(1, endAt - firstAt);
	const handshakes = entries.flatMap((entry) => {
		const observation = entry.handshakeFrame ?? entry.handshake;
		return observation ? [{ ...entry, observation }] : [];
	});
	const filteredHandshakes = handshakes.filter((entry) => {
		const handshake = entry.observation;
		const context =
			"connectionId" in handshake
				? `${handshake.connectionId} ${handshake.direction}`
				: `${handshake.peerId} ${handshake.reason ?? ""}`;
		return (
			`handshake ${handshake.type} ${context}`
				.toLowerCase()
				.includes(view.filter.toLowerCase()) &&
			(view.side === "all" || entry.side === view.side) &&
			(view.status === "all" ||
				getOutcomeClass(handshake.outcome) === view.status)
		);
	});
	const selectedHandshake =
		handshakes.find((entry) => `${entry.side}:${entry.id}` === view.selected) ??
		(calls.length === 0 ? filteredHandshakes[0] : undefined);
	const records = [
		...calls.map((call) => ({ call, at: call.startedAt })),
		...filteredHandshakes.map((entry) => ({ entry, at: entry.at })),
	].sort((left, right) => right.at - left.at);
	return (
		<ResizablePanelGroup
			key={vertical ? "stacked" : "columns"}
			id="network-panels"
			className="network-grid"
			orientation={vertical ? "vertical" : "horizontal"}
			defaultLayout={defaultLayout}
			onLayoutChanged={onLayoutChanged}
		>
			<ResizablePanel
				id="network-list"
				defaultSize={vertical ? "35%" : "60%"}
				minSize="20%"
			>
				<div className="network-list">
					<table className="network-table">
						<thead>
							<tr>
								{["Name", "Outcome", "Time", "Waterfall"].map((title) => (
									<th key={title}>{title}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{records.map((record) => {
								if ("entry" in record) {
									const { entry } = record;
									const handshake = entry.observation;
									const key = `${entry.side}:${entry.id}`;
									const isSelected = entry === selectedHandshake;
									return (
										<tr
											key={key}
											data-handshake={handshake.type}
											data-direction={entry.handshakeFrame?.direction}
											className={isSelected ? "selected" : ""}
											onClick={() =>
												onViewChange({
													selected: key,
													detail: DevtoolsDetailEnum.payload,
												})
											}
										>
											<td>
												<Button
													variant="ghost"
													className="call-link mono"
													aria-pressed={isSelected}
												>
													Handshake · {handshake.type}
												</Button>
												<small className="request-meta">
													<EndpointBadge side={entry.side} />
													<span>
														{entry.side} ·{" "}
														{"connectionId" in handshake
															? `${handshake.connectionId} · ${handshake.direction}`
															: handshake.peerId}{" "}
														· {entry.source}
													</span>
												</small>
											</td>
											<td
												className={`mono outcome ${getOutcomeClass(handshake.outcome)}`}
											>
												{handshake.outcome}
											</td>
											<td className="mono">
												<time
													dateTime={new Date(entry.at).toISOString()}
													title="Local observation time"
												>
													{new Date(entry.at).toLocaleTimeString("en-GB", {
														hour12: false,
													})}
												</time>
											</td>
											<td className="muted">
												{entry.handshakeFrame
													? `${entry.handshakeFrame.bytes} B`
													: "RPC event"}
											</td>
										</tr>
									);
								}
								const { call } = record;
								const key = getCallRecordKey(call);
								const isSelected =
									selectedHandshake === undefined &&
									selected !== undefined &&
									key === getCallRecordKey(selected);
								const elapsed = Math.max(
									0,
									(call.finishedAt ?? now) - call.startedAt,
								);
								return (
									<tr
										key={key}
										className={isSelected ? "selected" : ""}
										onClick={() =>
											onViewChange({
												selected: key,
												detail: DevtoolsDetailEnum.payload,
											})
										}
									>
										<td>
											<Button
												variant="ghost"
												className="call-link mono"
												data-call={key}
												title={`${call.service}.${call.method}`}
												aria-pressed={isSelected}
											>
												{formatDevtoolsService(call.service)}.{call.method}
											</Button>
											<small className="request-meta">
												<EndpointBadge side={call.side} />
												<span>
													{call.side} · {call.peerId}
												</span>
											</small>
										</td>
										<td
											className={`mono outcome ${getOutcomeClass(call.outcome)}`}
										>
											{call.outcome}
										</td>
										<td className="mono">{elapsed} ms</td>
										<td className="waterfall">
											<div
												className={`waterfall-bar ${getOutcomeClass(call.outcome)}`}
												style={{
													marginLeft: `${((call.startedAt - firstAt) / total) * 85}%`,
													width: `${Math.max(2, (elapsed / total) * 85)}%`,
												}}
												title="APP records start/end using the local clock; this is not network phase duration"
											/>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					<p className="empty-state">
						{records.length
							? `${records.length} matching records · click a call or handshake to inspect details. Endpoint clocks are independent.`
							: "No matching records yet. Connect or run a workflow to inspect calls and handshakes."}
					</p>
				</div>
			</ResizablePanel>
			<ResizableHandle
				withHandle
				data-resize="network"
				aria-label="Resize Network panel"
			/>
			<ResizablePanel
				id="network-details"
				defaultSize={vertical ? "65%" : "40%"}
				minSize="20%"
			>
				{selectedHandshake ? (
					<HandshakeDetails
						entry={selectedHandshake}
						view={view}
						onViewChange={onViewChange}
					/>
				) : (
					<RequestDetails
						call={selected}
						view={view}
						onViewChange={onViewChange}
					/>
				)}
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function RequestDetails({
	call,
	view,
	onViewChange,
}: {
	readonly call: LabCallRecord | undefined;
	readonly view: DevtoolsView;
	readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
}) {
	if (!call)
		return (
			<aside className="inspector">
				<div className="inspector-title">Select a Call</div>
				<p className="empty-state">
					Arguments, return values, and handler phases are explicitly recorded
					by the example; event$ stays payload-free.
				</p>
			</aside>
		);
	return (
		<aside className="inspector">
			<div className="inspector-title mono">
				{formatDevtoolsService(call.service)}.{call.method}
			</div>
			<Tabs
				className="request-details"
				value={view.detail}
				onValueChange={(detail) =>
					onViewChange({ detail: detail as DevtoolsDetailEnum })
				}
			>
				<TabsList className="detail-tabs" aria-label="Request Details">
					{Object.values(DevtoolsDetailEnum).map((name) => (
						<TabsTrigger key={name} value={name} data-detail={name}>
							{name}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value={DevtoolsDetailEnum.payload} className="detail-body">
					{[
						["Arguments", call.arguments],
						["Result / failure", call.result ?? call.outcome],
					].map(([label, value]) => (
						<Fragment key={label}>
							<h3>
								<ChevronDown aria-hidden="true" />
								{label}
							</h3>
							<small className="muted">APP · sample call wrapper</small>
							<pre className="payload">
								{view.payload
									? formatDevtoolsJson(value)
									: "Payload hidden / sample data hidden"}
							</pre>
						</Fragment>
					))}
				</TabsContent>
				<TabsContent value={DevtoolsDetailEnum.timing} className="detail-body">
					<p className="help">
						Phases come from actual application boundaries; durations use that
						endpoint's own clock.
					</p>
					{call.phases.map((phase) => (
						<RecordProperty
							key={`${phase.phase}:${phase.at}`}
							name={phase.phase}
							value={`+${Math.max(0, phase.at - call.startedAt)} ms`}
						/>
					))}
				</TabsContent>
				<TabsContent
					value={DevtoolsDetailEnum.overview}
					className="detail-body"
				>
					{[
						["Source", "APP · explicit wrapper"],
						["Side", call.side],
						["Peer", call.peerId],
						["Service", call.service],
						["Method", call.method],
						["Outcome", call.outcome],
						["Application trace", call.traceId],
						["Local APP record", call.id],
					].map(([name, value]) => (
						<RecordProperty key={name} name={name} value={value} />
					))}
				</TabsContent>
			</Tabs>
			<p className="inspector-note">
				Application trace is passed by the example; RPC observationId is paired
				only locally and cannot be used as distributed trace。
			</p>
		</aside>
	);
}

function getOutcomeClass(outcome: string): string {
	return outcome === "pending"
		? "pending"
		: outcome === "fulfilled" || outcome === "normal"
			? "fulfilled"
			: "failed";
}
