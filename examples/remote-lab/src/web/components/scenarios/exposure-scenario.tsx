/**
 * @overview ExposureScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function ExposureScenario({
	texts,
	scenario,
	unavailable,
	onAction,
	server,
}: Pick<WorkbenchProps, "texts" | "scenario" | "unavailable" | "onAction"> & {
	readonly server: WorkbenchProps["devtools"]["server"];
}) {
	return (
		<section data-scene="exposure" hidden={scenario !== "exposure"}>
			<div className="eyebrow">05 / DESCRIPTOR & EXPOSURE</div>
			<h1>The contract decides what is exposed.</h1>
			<p className="intro">
				Revocation affects future calls. Acceptor global routes and per-Peer
				routes are managed separately.
			</p>
			<div className="actions">
				<Button
					onClick={onAction}
					variant="outline"
					id="toggle-global"
					data-needs-peer
					disabled={unavailable}
				>
					{server?.globalExposure
						? "Revoke global shipping"
						: "Restore global shipping"}
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="test-shipping"
					data-needs-peer
					disabled={unavailable}
				>
					Call shipping.quote
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="test-local"
					data-needs-peer
					disabled={unavailable}
				>
					Call this Peer inspect
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="exposure-conflict"
					data-needs-peer
					disabled={unavailable}
				>
					Trigger same-name exposure conflict
				</Button>
			</div>
			<div id="peer-exposures" className="peer-exposures">
				{server?.peers.map((peer) => (
					<div key={peer.id} className="peer-exposure">
						<span>
							{peer.id} · {peer.status} · inspect{" "}
							{peer.peerExposure ? "exposed" : "revoked"}
						</span>
						<Button
							onClick={onAction}
							variant="outline"
							data-exposure-peer={peer.id}
							disabled={unavailable}
						>
							{peer.peerExposure ? "Revoke this Peer" : "Restore this Peer"}
						</Button>
					</div>
				))}
			</div>
			<p id="exposure-result" className="scenario-result" role="status">
				{texts["#exposure-result"] ??
					"Actual routes and allowlists are shown in Services."}
			</p>
		</section>
	);
}
