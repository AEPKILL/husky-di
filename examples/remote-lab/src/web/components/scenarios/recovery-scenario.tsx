/**
 * @overview RecoveryScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function RecoveryScenario({
	texts,
	scenario,
	peerId,
	unavailable,
	reportBusy,
	onAction,
	server,
}: Pick<
	WorkbenchProps,
	"texts" | "scenario" | "peerId" | "unavailable" | "reportBusy" | "onAction"
> & { readonly server: WorkbenchProps["devtools"]["server"] }) {
	return (
		<section data-scene="recovery" hidden={scenario !== "recovery"}>
			<div className="eyebrow">03 / RETAINED SESSION</div>
			<h1>Replace the connection and preserve this call.</h1>
			<p className="intro">
				Close the current real WebSocket; the supervisor will try to resume.
				Peer and resolved facade keep the same references.
			</p>
			<div className="actions">
				<Button
					onClick={onAction}
					variant="outline"
					id="disconnect"
					data-needs-peer
					className="primary"
					disabled={unavailable}
				>
					Disconnect WebSocket
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="recovery-report"
					data-needs-peer
					disabled={unavailable || reportBusy}
				>
					Start 3s Report Then Disconnect
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="expire"
					data-needs-peer
					disabled={unavailable || reportBusy}
				>
					Block reconnect · 5s recovery deadline
				</Button>
				<Button onClick={onAction} variant="outline" id="allow-reconnect">
					Allow Later Reconnect
				</Button>
			</div>
			<div className="state-strip">
				<div>
					<small>PEER / authoritative state</small>
					<strong id="recovery-state">
						{texts["#recovery-state"] ?? "connecting"}
					</strong>
				</div>
				<div>
					<small>SUPERVISOR / attempt policy</small>
					<strong id="recovery-supervisor">
						{texts["#recovery-supervisor"] ?? "idle"}
					</strong>
				</div>
				<div>
					<small>HANDLER ENTRIES / app count</small>
					<strong id="handler-entries">
						{server?.peers.find((peer) => peer.id === peerId)?.handlerEntries ??
							0}
					</strong>
				</div>
			</div>
			<p className="help">
				The deadline exercise terminates this Session; reload to create a new
				Session. Admitted call results may be outcome-unknown and must not be
				blindly retried.
			</p>
		</section>
	);
}
