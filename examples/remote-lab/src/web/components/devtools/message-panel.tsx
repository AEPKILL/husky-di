/**
 * @overview Inspect Transport and Lab-owned stream messages by direction.
 * @author AEPKILL
 * @created 2026-09-11 06:58:25
 */

import type { Layout } from "react-resizable-panels";
import {
	LabSideEnum,
	LabSourceEnum,
	LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";
import { EndpointBadge } from "@/web/components/devtools/endpoint-badge";
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
	DevtoolsTimeSortEnum,
} from "@/web/enums/devtools.enum";
import type {
	DevtoolsView,
	RenderDevtoolsOptions,
} from "@/web/types/devtools.type";
import { formatDevtoolsJson } from "@/web/utils/format-devtools-json.util";
import { formatDevtoolsService } from "@/web/utils/format-devtools-service.util";

export function MessagePanel({
	entries,
	view,
	vertical,
	onViewChange,
	defaultLayout,
	onLayoutChanged,
}: {
	readonly entries: RenderDevtoolsOptions["entries"];
	readonly view: DevtoolsView;
	readonly vertical: boolean;
	readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
	readonly defaultLayout?: Layout;
	readonly onLayoutChanged?: (layout: Layout) => void;
}) {
	const direction = view.networkDirection ?? "all";
	const timeSort = view.networkTimeSort ?? DevtoolsTimeSortEnum.ascending;
	const ascending = timeSort === DevtoolsTimeSortEnum.ascending;
	const side =
		view.side === LabSideEnum.node ? LabSideEnum.node : LabSideEnum.browser;
	const filter = view.filter.toLowerCase();
	const records = [...entries]
		.reverse()
		.flatMap((entry) => {
			const message = entry.transportMessage;
			const showManagedE2e = view.side === "all" && entry.managedE2e === true;
			if (!message || (entry.side !== side && !showManagedE2e)) return [];
			const label = getMessageLabel(message.type, message.payload);
			const outcome =
				message.outcome === "fulfilled" || message.outcome === "normal"
					? "fulfilled"
					: "failed";
			if (
				(direction !== "all" && message.direction !== direction) ||
				(view.status !== "all" && view.status !== outcome) ||
				!`${label.type} ${label.name} ${message.type} ${message.connectionId} ${message.payload ?? ""}`
					.toLowerCase()
					.includes(filter)
			)
				return [];
			return [{ entry, message, label, outcome }];
		})
		.sort((left, right) =>
			ascending
				? left.entry.at - right.entry.at
				: right.entry.at - left.entry.at,
		);
	const selected =
		records.find(
			({ entry }) => `${entry.side}:${entry.id}` === view.selected,
		) ?? records[0];
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
				defaultSize={vertical ? "55%" : "60%"}
				minSize="20%"
			>
				<div className="network-list">
					<div className="message-toolbar">
						<span>
							<EndpointBadge side={side} /> {side} perspective
						</span>
						<select
							aria-label="Filter by direction"
							value={direction}
							onChange={(event) =>
								onViewChange({ networkDirection: event.target.value })
							}
						>
							<option value="all">All Messages</option>
							<option value={LabTransportDirectionEnum.sent}>Sent</option>
							<option value={LabTransportDirectionEnum.received}>
								Received
							</option>
						</select>
					</div>
					<table className="network-table message-table">
						<thead>
							<tr>
								{["Direction", "Data", "Length"].map((title) => (
									<th key={title}>{title}</th>
								))}
								<th aria-sort={timeSort}>
									<Button
										variant="ghost"
										className="message-sort"
										aria-label={
											ascending ? "Sort newest first" : "Sort oldest first"
										}
										title={
											ascending
												? "Oldest messages first; click to reverse"
												: "Newest messages first; click to reverse"
										}
										onClick={() =>
											onViewChange({
												networkTimeSort: ascending
													? DevtoolsTimeSortEnum.descending
													: DevtoolsTimeSortEnum.ascending,
												selected: selected
													? `${selected.entry.side}:${selected.entry.id}`
													: view.selected,
											})
										}
									>
										Time <span aria-hidden="true">{ascending ? "↑" : "↓"}</span>
									</Button>
								</th>
							</tr>
						</thead>
						<tbody>
							{records.map((record) => {
								const { entry, message, label, outcome } = record;
								const key = `${entry.side}:${entry.id}`;
								const isSelected = record === selected;
								const observedAt = new Date(entry.at);
								return (
									<tr
										key={key}
										data-message={label.type}
										data-frame={message.type}
										data-direction={message.direction}
										data-side={entry.side}
										className={isSelected ? "selected" : ""}
										onClick={() =>
											onViewChange({
												selected: key,
												detail: DevtoolsDetailEnum.payload,
											})
										}
									>
										<td>
											<span
												className="message-direction"
												data-direction={message.direction}
											>
												{formatDirection(message.direction)}
											</span>
										</td>
										<td>
											<Button
												variant="ghost"
												className="call-link message-name mono"
												aria-pressed={isSelected}
											>
												{entry.source === LabSourceEnum.stream
													? "STREAM · "
													: ""}
												{label.type}
												{label.name ? ` · ${label.name}` : ""}
											</Button>
											<small className="message-preview mono">
												{view.payload
													? message.payload === undefined
														? "Message payload not recorded"
														: `${message.payload.slice(0, 160)}${message.payload.length > 160 ? "…" : ""}`
													: "Payload hidden / Message payload hidden"}
											</small>
											<small className="message-connection request-meta">
												<span>{message.connectionId}</span>
												<span className={`outcome ${outcome}`}>
													{message.outcome}
												</span>
											</small>
										</td>
										<td className="mono">{message.bytes} B</td>
										<td className="mono">
											<time
												dateTime={observedAt.toISOString()}
												title="Local observation time"
											>
												{observedAt.toLocaleTimeString("en-GB", {
													hour12: false,
												})}
												.{String(observedAt.getMilliseconds()).padStart(3, "0")}
											</time>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					<p className="empty-state">
						{records.length
							? `${records.length} messages · ordered by local observation time`
							: "No matching messages yet. Connect or run a workflow to inspect sent and received frames."}
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
				defaultSize={vertical ? "45%" : "40%"}
				minSize="20%"
			>
				<aside className="inspector">
					<div className="inspector-title mono">
						{selected
							? `${selected.label.type}${selected.label.name ? ` · ${selected.label.name}` : ""}`
							: "Select a Message"}
					</div>
					{selected ? (
						<Tabs
							className="request-details"
							value={view.detail}
							onValueChange={(detail) =>
								onViewChange({ detail: detail as DevtoolsDetailEnum })
							}
						>
							<TabsList className="detail-tabs" aria-label="Message Details">
								{Object.values(DevtoolsDetailEnum).map((name) => (
									<TabsTrigger key={name} value={name} data-detail={name}>
										{name}
									</TabsTrigger>
								))}
							</TabsList>
							<TabsContent
								value={DevtoolsDetailEnum.payload}
								className="detail-body"
							>
								<h3>
									{formatDirection(selected.message.direction)} ·{" "}
									{selected.label.type}
								</h3>
								<pre className="payload">
									{!view.payload
										? "Payload hidden / Message payload hidden"
										: selected.message.payload === undefined
											? "Message payload was not recorded; this record contains only Transport boundary metadata."
											: formatDevtoolsJson(selected.message.payload)}
								</pre>
								{view.payload && selected.message.payload !== undefined ? (
									<details>
										<summary>Raw JSON</summary>
										<pre className="raw-handshake">
											{selected.message.payload}
										</pre>
									</details>
								) : null}
							</TabsContent>
							<TabsContent
								value={DevtoolsDetailEnum.overview}
								className="detail-body"
							>
								{[
									["Source", getMessageSourceLabel(selected.entry.source)],
									["Type", selected.label.type],
									["Side", selected.entry.side],
									["Direction", formatDirection(selected.message.direction)],
									["Connection", selected.message.connectionId],
									["Length", `${selected.message.bytes} B`],
									["Outcome", selected.message.outcome],
									["Observation", selected.entry.summary],
									["Observed at", new Date(selected.entry.at).toISOString()],
								].map(([name, value]) => (
									<RecordProperty key={name} name={name} value={value} />
								))}
							</TabsContent>
							<TabsContent
								value={DevtoolsDetailEnum.timing}
								className="detail-body"
							>
								<RecordProperty
									name="Observed at"
									value={new Date(selected.entry.at).toISOString()}
								/>
								<p className="help">
									{selected.entry.source === LabSourceEnum.stream
										? "Lab stream instrumentation observation time; does not represent real RPC round trip."
										: "Local Transport observation time; message round trip and remote handler duration are not measured."}
								</p>
							</TabsContent>
						</Tabs>
					) : (
						<p className="empty-state">
							Select a sent or received message to inspect Payload and Transport
							/ Stream metadata.
						</p>
					)}
					<p className="inspector-note">
						{selected?.entry.source === LabSourceEnum.stream
							? "STREAM records are produced by the Lab-owned RxJS experiment to observe the full stream lifecycle."
							: "Direction is relative to the current observing endpoint. Successful send means local Transport admission, not remote receipt or completion."}
					</p>
				</aside>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function formatDirection(direction: LabTransportDirectionEnum): string {
	return direction === LabTransportDirectionEnum.sent ? "↑ Sent" : "↓ Received";
}

function getMessageSourceLabel(source: LabSourceEnum): string {
	return source === LabSourceEnum.stream
		? "STREAM · Lab-owned instrumentation"
		: "TRANSPORT · Adapter boundary";
}

function getMessageLabel(
	type: string,
	payload: string | undefined,
): { type: string; name: string } {
	if (payload !== undefined) {
		try {
			const frame: unknown = JSON.parse(payload);
			if (
				typeof frame === "object" &&
				frame !== null &&
				!Array.isArray(frame)
			) {
				const envelope = frame as Record<string, unknown>;
				const inner = envelope.message;
				const message =
					type === "message" &&
					typeof inner === "object" &&
					inner !== null &&
					!Array.isArray(inner)
						? (inner as Record<string, unknown>)
						: envelope;
				const memberName =
					typeof message.method === "string" ? message.method : message.member;
				return {
					type: typeof message.kind === "string" ? message.kind : type,
					name:
						typeof message.service === "string" &&
						typeof memberName === "string"
							? `${formatDevtoolsService(message.service)}.${memberName}`
							: typeof message.callId === "string"
								? `#${message.callId}`
								: typeof message.streamId === "string"
									? `stream-${message.streamId}`
									: "",
				};
			}
		} catch {
			// Unrecorded or non-JSON content keeps its observed Transport label.
		}
	}
	return { type, name: "" };
}
