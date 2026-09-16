/**
 * @overview ShutdownScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function ShutdownScenario({
	texts,
	scenario,
	unavailable,
	capacityPending,
	onAction,
}: Pick<
	WorkbenchProps,
	"texts" | "scenario" | "unavailable" | "capacityPending" | "onAction"
>) {
	return (
		<section data-scene="shutdown" hidden={scenario !== "shutdown"}>
			<div className="eyebrow">08 / OWNER LIFETIME</div>
			<h1>Give in-flight work a clear ending.</h1>
			<p className="intro">
				Stop reconnection supervision first, then drain or force-close the
				Connector. Reload after termination to create a new session.
			</p>
			<div className="actions">
				<Button
					onClick={onAction}
					variant="outline"
					id="shutdown"
					className="primary"
				>
					Graceful shutdown
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="force-close"
					className="danger"
				>
					Forced close
				</Button>
				<Button onClick={onAction} variant="outline" id="reload">
					Reload
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="capacity-run"
					data-needs-peer
					disabled={unavailable || capacityPending}
				>
					12 concurrent calls · capacity exercise
				</Button>
			</div>
			<p className="help">
				Creation config: 8 pending invocations / Session · recovery grace 5 s ·
				binding attempt 3 s. The exercise returns each actual call result;
				accepted count depends on current state.
			</p>
			<pre id="capacity-result" className="scenario-result">
				{texts["#capacity-result"] ?? "Capacity exercise has not run yet."}
			</pre>
			<p className="help">
				Start long work first, then switch here to compare results. Shutdown
				stops HTTP observation polling and keeps the last snapshot.
			</p>
		</section>
	);
}
