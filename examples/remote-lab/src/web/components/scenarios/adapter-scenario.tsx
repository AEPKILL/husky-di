/**
 * @overview AdapterScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import type { WorkbenchProps } from "@/web/types/workbench.type";

export function AdapterScenario({
	scenario,
	transportSummary,
}: Pick<WorkbenchProps, "scenario"> & { readonly transportSummary: string }) {
	return (
		<section data-scene="adapter" hidden={scenario !== "adapter"}>
			<div className="eyebrow">09 / ADAPTER & CONFORMANCE</div>
			<h1>Byte channels have clear boundaries.</h1>
			<p className="intro">
				This page uses an independent @husky-di/remote-websocket Adapter. send
				completion only means local admission, not remote receipt or handler
				completion.
			</p>
			<div className="adapter-grid">
				<div>
					<small>CONNECTION-LEVEL TRANSPORT</small>
					<pre id="transport-summary">
						{transportSummary || "Waiting for real byte observation..."}
					</pre>
					<p className="help">
						Byte counts belong to the Connection; they are not allocated to
						calls, decoded, or used to display handshake credentials.
					</p>
				</div>
				<div>
					<small>
						Run from the repository root / this page has not run conformance
						tests
					</small>
					<pre className="command">
						pnpm --filter @husky-di/remote-websocket test
					</pre>
					<p className="help">
						Adapter / Protocol conformance is provided by
						@husky-di/remote/conformance Public entrypoints:
						@husky-di/remote/transport (Connection / Adapter);
						@husky-di/remote/protocol (replaceable Protocol). Actual conformance
						reports come from package tests.
					</p>
				</div>
			</div>
		</section>
	);
}
