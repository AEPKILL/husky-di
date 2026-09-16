/**
 * @overview PeersScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { RpcStateStatusEnum } from "@husky-di/remote";
import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function PeersScenario({
	texts,
	scenario,
	peerId,
	unavailable,
	onAction,
	server,
}: Pick<
	WorkbenchProps,
	"texts" | "scenario" | "peerId" | "unavailable" | "onAction"
> & { readonly server: WorkbenchProps["devtools"]["server"] }) {
	return (
		<section data-scene="peers" hidden={scenario !== "peers"}>
			<div className="eyebrow">04 / MULTIPLE PEERS</div>
			<h1>One Node, multiple independent Peers.</h1>
			<p className="intro">
				Each tab owns its own Peer. Targeted callbacks and broadcasts both use
				real RPC; broadcasting is composed by the sample app.
			</p>
			<div className="inline-form">
				<Button onClick={onAction} variant="outline" id="open-peer">
					Open Second Browser Peer
				</Button>
				<label>
					Target Peer
					<select id="peer-select" aria-label="Target Peer">
						{server?.peers
							.filter((peer) => peer.status === RpcStateStatusEnum.connected)
							.map((peer) => (
								<option key={peer.id} value={peer.id}>
									{peer.id}
									{peer.id === peerId ? " (this tab)" : ""}
								</option>
							))}
					</select>
				</label>
				<label>
					Messages
					<input
						id="peer-message"
						defaultValue="Hello from Node"
						maxLength={120}
					/>
				</label>
				<Button
					onClick={onAction}
					variant="outline"
					id="peer-callback"
					data-needs-peer
					className="primary"
					disabled={unavailable}
				>
					Targeted Callback
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="peer-fanout"
					data-needs-peer
					disabled={unavailable}
				>
					Broadcast All Peers
				</Button>
			</div>
			<pre id="peers-result" className="scenario-result">
				{texts["#peers-result"] ?? "Waiting for Peer snapshot..."}
			</pre>
		</section>
	);
}
