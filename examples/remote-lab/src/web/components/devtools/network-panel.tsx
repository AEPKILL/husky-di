/**
 * @overview Selectable application calls, full handshake frames, and RPC lifecycle observations.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { ChevronDown } from "lucide-react";
import { Fragment } from "react";
import type { LabCallRecord } from "@/types/lab-recording.type";
import { EndpointBadge } from "@/web/components/devtools/endpoint-badge";
import { HandshakeDetails } from "@/web/components/devtools/handshake-details";
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
import { DevtoolsDetailEnum } from "@/web/enums/devtools.enum";
import type {
	DevtoolsView,
	RenderDevtoolsOptions,
} from "@/web/types/devtools.type";
import { formatDevtoolsJson } from "@/web/utils/format-devtools-json.util";
import { formatDevtoolsService } from "@/web/utils/format-devtools-service.util";
import { getCallRecordKey } from "@/web/utils/get-call-record-key.util";

export function NetworkPanel({
	calls,
	entries,
	selected,
	view,
	vertical,
	onViewChange,
}: {
	readonly calls: readonly LabCallRecord[];
	readonly entries: RenderDevtoolsOptions["entries"];
	readonly selected: LabCallRecord | undefined;
	readonly view: DevtoolsView;
	readonly vertical: boolean;
	readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
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
			`handshake 握手 ${handshake.type} ${context}`
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
													title="本端观察时间"
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
												title="APP 记录本机时钟的起止时间；并非网络阶段耗时"
											/>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					<p className="empty-state">
						{records.length
							? `${records.length} 条符合筛选条件 · 点击调用或握手查看详情。两端时钟独立。`
							: "尚无匹配记录。连接或运行业务场景后查看调用与握手。"}
					</p>
				</div>
			</ResizablePanel>
			<ResizableHandle
				withHandle
				data-resize="network"
				aria-label="调整 Network 面板大小"
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
				<div className="inspector-title">选择一条调用</div>
				<p className="empty-state">
					参数、返回值与处理器阶段由示例显式记录；event$ 保持无 payload。
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
				<TabsList className="detail-tabs" aria-label="请求详情">
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
							<small className="muted">APP · 示例调用包装器</small>
							<pre className="payload">
								{view.payload
									? formatDevtoolsJson(value)
									: "Payload hidden / 已隐藏示例数据"}
							</pre>
						</Fragment>
					))}
				</TabsContent>
				<TabsContent value={DevtoolsDetailEnum.timing} className="detail-body">
					<p className="help">阶段取自实际应用边界；耗时使用该端自己的时钟。</p>
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
				应用 trace 由示例传递；RPC observationId 只在本端配对，不能作为分布式
				trace。
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
