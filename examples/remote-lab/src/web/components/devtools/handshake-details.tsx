/**
 * @overview Displays complete Transport handshake JSON and distinct public RPC lifecycle details.
 * @author AEPKILL
 * @created 2026-09-10 21:55:04
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
					<TabsList className="detail-tabs" aria-label="Handshake Details">
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
								: "Payload hidden / Handshake payload hidden"}
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
							Local Transport observation time; full handshake duration is not
							measured.
						</p>
					</TabsContent>
				</Tabs>
			) : (
				<div className="detail-body">{properties}</div>
			)}
			<p className="inspector-note">
				{frame
					? "Full Transport handshake payload; reject means protocol rejection. Send admission status appears in Overview / Observation."
					: "Public connection and recovery events; times are local observation moments. Events contain no handshake payload and do not measure handshake duration."}
			</p>
		</aside>
	);
}
