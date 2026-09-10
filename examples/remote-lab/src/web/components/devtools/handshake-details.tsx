/**
 * @overview Displays complete Transport handshake JSON and distinct public RPC lifecycle details.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { RecordProperty } from "@/web/components/devtools/record-property";
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

export function HandshakeDetails({
	entry,
	view,
	onViewChange,
}: {
	readonly entry: RenderDevtoolsOptions["entries"][number];
	readonly view: DevtoolsView;
	readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
}) {
	const frame = entry.handshakeFrame;
	const observation = frame ?? entry.handshake;
	if (!observation) return null;
	const observedAt = new Date(entry.at).toISOString();
	const properties = [
		["Source", frame ? "TRANSPORT · Adapter boundary" : "RPC · Owner event$"],
		[frame ? "Frame" : "Event", observation.type],
		["Side", entry.side],
		...(frame
			? [
					["Connection", frame.connectionId],
					["Direction", frame.direction],
					["Bytes", `${frame.bytes} B`],
					["Observation", entry.summary],
				]
			: [["Peer", entry.handshake?.peerId ?? "—"]]),
		["Outcome", observation.outcome],
		["Observed at", observedAt],
		...(!frame ? [["Close reason", entry.handshake?.reason ?? "—"]] : []),
	].map(([name, value]) => (
		<RecordProperty key={name} name={name} value={value} />
	));
	return (
		<aside className="inspector">
			<div className="inspector-title mono">Handshake · {observation.type}</div>
			{frame ? (
				<Tabs
					className="request-details"
					value={view.detail}
					onValueChange={(detail) =>
						onViewChange({ detail: detail as DevtoolsDetailEnum })
					}
				>
					<TabsList className="detail-tabs" aria-label="握手详情">
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
						<h3>Handshake frame · {frame.direction}</h3>
						<pre className="payload">
							{view.payload
								? formatDevtoolsJson(frame.payload)
								: "Payload hidden / 已隐藏握手报文"}
						</pre>
						{view.payload ? (
							<details>
								<summary>Raw JSON</summary>
								<pre className="raw-handshake">{frame.payload}</pre>
							</details>
						) : null}
					</TabsContent>
					<TabsContent
						value={DevtoolsDetailEnum.overview}
						className="detail-body"
					>
						{properties}
					</TabsContent>
					<TabsContent
						value={DevtoolsDetailEnum.timing}
						className="detail-body"
					>
						<RecordProperty name="Observed at" value={observedAt} />
						<p className="help">
							本端 Transport 观察时刻，未测量完整握手耗时。
						</p>
					</TabsContent>
				</Tabs>
			) : (
				<div className="detail-body">{properties}</div>
			)}
			<p className="inspector-note">
				{frame
					? "完整 Transport 握手报文；reject 表示协议拒绝，发送接纳状态见 Overview / Observation。"
					: "连接与恢复的公开事件；时间为本端观察时刻。事件不包含握手报文，未测量握手耗时。"}
			</p>
		</aside>
	);
}
