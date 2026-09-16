/**
 * @overview Inspects owner observations, locally timed RPC pending work, and independent APP handlers.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { RpcCallDirectionEnum } from "@husky-di/remote";
import { useState } from "react";
import { LAB_MEMBERS, LAB_SERVICE_NAMES } from "@/consts/lab-services.const";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import type {
	LabBrowserOwnerSnapshot,
	LabOwnerConfiguration,
} from "@/types/lab-owner.type";
import type { LabCallRecord, LabLogEntry } from "@/types/lab-recording.type";
import type { LabServerSnapshot } from "@/types/lab-server.type";
import type {
	NodeDiagnosticsSnapshot,
	RpcDiagnosticsSnapshot,
} from "@/types/rpc-diagnostics.type";
import { RecordProperty } from "@/web/components/devtools/record-property";

export function OwnerPanel({
	browserOwner,
	browserDiagnostics,
	nodeDiagnostics,
	server,
	peerId,
	sessionId,
	entries,
	calls,
	nodeObservation,
}: {
	readonly browserOwner: LabBrowserOwnerSnapshot;
	readonly browserDiagnostics: RpcDiagnosticsSnapshot;
	readonly nodeDiagnostics: NodeDiagnosticsSnapshot | undefined;
	readonly server: LabServerSnapshot | undefined;
	readonly peerId: string | undefined;
	readonly sessionId: string | undefined;
	readonly entries: readonly (LabLogEntry & { readonly side: LabSideEnum })[];
	readonly calls: readonly LabCallRecord[];
	readonly nodeObservation: string;
}) {
	const [selectedPeer, setSelectedPeer] = useState("");
	const selected = nodeDiagnostics?.peers.find(
		(peer) => peer.id === selectedPeer,
	);
	return (
		<div className="owner-panel">
			<p className="inspector-note">
				Read-only public state and Lab observation; Peer selection affects only
				this panel. RPC observation ID is local to one endpoint. Unknown fields
				do not imply protocol queues or handler phases.
			</p>
			<div className="owner-grid">
				<section aria-label="Acceptor information">
					<h3>Node · Acceptor</h3>
					<RecordProperty
						name="Observation"
						value={
							nodeDiagnostics
								? `${nodeObservation} · ${new Date(nodeDiagnostics.observedAt).toISOString()}`
								: "Unknown · Node snapshot not available yet"
						}
					/>
					<RecordProperty
						name="server instance"
						value={server?.instanceId ?? "Unknown"}
					/>
					<RecordProperty
						name="Owner"
						value={
							nodeDiagnostics
								? JSON.stringify(nodeDiagnostics.owner)
								: "Unknown"
						}
					/>
					<RecordProperty
						name="Listener"
						value={
							nodeDiagnostics
								? nodeDiagnostics.listener
									? JSON.stringify(nodeDiagnostics.listener)
									: "N/A · Owner current state has no listener"
								: "Unknown"
						}
					/>
					<label>
						Acceptor Peer{" "}
						<select
							aria-label="Info Panel Peer"
							value={selectedPeer}
							onChange={(event) => setSelectedPeer(event.target.value)}
						>
							<option value="">
								All Peers ({nodeDiagnostics?.peers.length ?? "Unknown"})
							</option>
							{nodeDiagnostics?.peers.map((peer, index) => (
								<option key={peer.id ?? index} value={peer.id}>
									{peer.id ?? "Unknown"}
									{peer.id === peerId ? " · current page" : ""} ·{" "}
									{peer.state.status}
								</option>
							))}
							{selectedPeer && !selected ? (
								<option value={selectedPeer}>
									{selectedPeer} · no longer in current member set
								</option>
							) : null}
						</select>
					</label>
					{(selected
						? [selected]
						: selectedPeer
							? []
							: (nodeDiagnostics?.peers ?? [])
					).map((peer, index) => (
						<RecordProperty
							key={peer.id ?? index}
							name={`${peer.id ?? "Unknown"}${peer.id === peerId ? " · current page" : ""}`}
							value={JSON.stringify(peer.state)}
						/>
					))}
					{selectedPeer && !selected ? (
						<p>
							This Peer left the current set; closed observations appear in
							bounded history.
						</p>
					) : null}
					<PendingCalls
						label="Node Acceptor"
						diagnostics={nodeDiagnostics}
						peerId={selectedPeer}
						freshness={nodeObservation}
					/>
					<Configuration values={nodeDiagnostics?.configuration} />
					<details>
						<summary>
							Recent actual Node Connection / Session observation
						</summary>
						<pre>
							{JSON.stringify(
								server?.recording.connections ?? "Unknown",
								null,
								2,
							)}
						</pre>
						<p>
							Adapter observation, using Node time; it does not represent
							internal binding, ACK, or live queues. Do not infer a selected
							Peer to Connection association without evidence.
						</p>
					</details>
				</section>
				<section aria-label="Connector information">
					<h3>Browser · Connector</h3>
					<RecordProperty
						name="current page Peer"
						value={
							peerId ??
							"Unknown · current server instance association not confirmed"
						}
					/>
					<RecordProperty
						name="Owner"
						value={JSON.stringify(browserOwner.owner)}
					/>
					<RecordProperty
						name="Stable Peer"
						value={JSON.stringify(browserOwner.peer)}
					/>
					<RecordProperty
						name="Reconnection supervisor"
						value={JSON.stringify(browserOwner.supervisor)}
					/>
					<RecordProperty
						name="Session"
						value={sessionId ?? "Unknown · not observed yet"}
					/>
					<PendingCalls
						label="Browser Connector"
						diagnostics={browserDiagnostics}
						freshness="live"
					/>
					<Configuration values={browserOwner.configuration} />
					<details>
						<summary>
							Recent actual Browser Connection / Session observation
						</summary>
						<pre>{JSON.stringify(browserOwner.connections, null, 2)}</pre>
						<p>
							Adapter observation; an empty list means there are no
							still-observed Connections; waiting for reconnect is not a
							substitute for live transport.
						</p>
					</details>
					<details>
						<summary>Recent reconnect failures (up to 24)</summary>
						<pre>
							{JSON.stringify(browserOwner.reconnectionEvents, null, 2)}
						</pre>
					</details>
				</section>
			</div>
			<section aria-label="APP unfinished handlers">
				<h3>
					APP unfinished handlers / pauses (independent of RPC Pending Calls)
				</h3>
				{calls
					.filter(
						(call) =>
							call.outcome === "pending" &&
							call.direction === RpcCallDirectionEnum.incoming &&
							(!selectedPeer ||
								call.side === LabSideEnum.browser ||
								call.peerId === selectedPeer ||
								call.peerId === "acceptor"),
					)
					.map((call) => (
						<div className="service-row" key={`${call.side}:${call.id}`}>
							<strong>
								{call.side} · {call.peerId} · {call.traceId}
							</strong>
							<span>
								{call.service}.{call.method}
							</span>
							<span>
								{call.phases
									.map(
										(phase) =>
											`${phase.phase}${phase.detail ? ` · ${phase.detail}` : ""}`,
									)
									.join(" → ")}
							</span>
							<span>
								{call.side === LabSideEnum.node ? nodeObservation : "live"}
							</span>
						</div>
					))}
				{server?.pausedReports
					.filter((paused) => !selectedPeer || paused.peerId === selectedPeer)
					.map((paused) => (
						<RecordProperty
							key={paused.traceId}
							name={`${paused.peerId} · ${paused.traceId}`}
							value={`Pause · aborted=${paused.aborted} · ${nodeObservation}`}
						/>
					))}
				<p>
					Cancellation ends RPC waiting, but does not mean the APP handler ended
					or application effects rolled back. A global handler's acceptor
					ownership does not invent a caller Peer.
				</p>
			</section>
			<details>
				<summary>Lab known services and exposures (read-only)</summary>
				<RecordProperty
					name={LAB_SERVICE_NAMES.lab}
					value={`Node Peer · ${Object.entries(LAB_MEMBERS)
						.map(
							([name, method]) =>
								`${name}${"cancelable" in method ? " (cancelable)" : ""}`,
						)
						.join(", ")} · installed on admitted Peer`}
				/>
				<RecordProperty
					name={LAB_SERVICE_NAMES.shipping}
					value={`Node Acceptor · quote · ${server ? (server.globalExposure ? "exposed" : "revoked") : "Unknown"}`}
				/>
				{server?.peers.map((peer) => (
					<RecordProperty
						key={peer.id}
						name={`${peer.id} · ${LAB_SERVICE_NAMES.peer}`}
						value={`inspect · ${peer.peerExposure ? "exposed" : "revoked"}`}
					/>
				))}
				<RecordProperty
					name="example.greeting.v1"
					value="Node Peer · greet, ready · installed on admitted Peer"
				/>
				<RecordProperty
					name="example.lab-browser.v1"
					value="Browser Peer · receive · installed for this page lifetime"
				/>
				<RecordProperty
					name="example.browser-display.v1"
					value="Browser Peer · showMessage · installed for this page lifetime"
				/>
				{[
					...(server?.custom?.definitions ?? []),
					...browserOwner.customDefinitions,
				].map((definition) => (
					<RecordProperty
						key={definition.id}
						name={`${definition.wireName} · ${definition.id}`}
						value={`${definition.target.scope} / ${definition.target.instanceId} / ${definition.target.peerId ?? "acceptor"} · ${definition.methods.map((method) => `${method.name}${method.cancelable ? " (cancelable)" : ""}`).join(", ")} · ${definition.exposed ? "exposed" : "revoked / saved"} · ${definition.targetValid ? "Target valid" : "Target invalid"}`}
					/>
				))}
				<p>
					Custom definitions and Services use the same Lab records. Declaration
					or exposure does not guarantee the remote endpoint is currently
					callable; the source is Lab definition and cleanup tracking.
				</p>
			</details>
			<details>
				<summary>Bounded lifecycle history</summary>
				{entries
					.filter(
						(entry) =>
							entry.handshake &&
							(!selectedPeer ||
								entry.side === LabSideEnum.browser ||
								entry.handshake.peerId === selectedPeer),
					)
					.map((entry) => (
						<RecordProperty
							key={`${entry.side}:${entry.id}`}
							name={`${entry.side} · ${new Date(entry.at).toISOString()}`}
							value={entry.summary}
						/>
					))}
			</details>
		</div>
	);
}

function PendingCalls({
	label,
	diagnostics,
	peerId,
	freshness,
}: {
	readonly label: string;
	readonly diagnostics: RpcDiagnosticsSnapshot | undefined;
	readonly peerId?: string;
	readonly freshness: string;
}) {
	const calls = diagnostics?.pendingCalls.filter(
		(call) => !peerId || call.peerId === peerId,
	);
	return (
		<section>
			<h4>
				{label} · RPC Pending Calls · {calls?.length ?? "Unknown"}
			</h4>
			<p>
				{freshness} · Wait duration is measured through the local endpoint's
				last observation. It includes invocations not yet admitted and is not
				the protocol pending-send queue.
			</p>
			{calls?.map((call) => (
				<div className="service-row" key={call.observationId}>
					<strong>
						{call.peerId ?? "Unknown Peer"} · {call.observationId}
					</strong>
					<span>
						{call.direction} · {call.service ?? "Unknown service"}.
						{call.method ?? "Unknown method"}
					</span>
					<time>{new Date(call.startedAt).toISOString()}</time>
					<span>
						{Math.max(
							0,
							(diagnostics?.observedAt ?? call.startedAt) - call.startedAt,
						)}{" "}
						ms · local start observation
					</span>
				</div>
			))}
			<details>
				<summary>
					{diagnostics?.totalEvents ?? "Unknown"} events since Clear · recent 24
				</summary>
				<pre>
					{diagnostics?.recentEvents.join("\n") ??
						"Unknown · observation not available yet"}
				</pre>
			</details>
		</section>
	);
}

function Configuration({
	values,
}: {
	readonly values: readonly LabOwnerConfiguration[] | undefined;
}) {
	return (
		<details>
			<summary>Creation config and sources</summary>
			{values?.map((entry) => (
				<RecordProperty
					key={entry.name}
					name={entry.name}
					value={`${entry.value} · ${entry.source}`}
				/>
			))}
			<p>
				Creation-time config, not internal live usage. Adapter options not
				listed were not passed explicitly.
			</p>
		</details>
	);
}
