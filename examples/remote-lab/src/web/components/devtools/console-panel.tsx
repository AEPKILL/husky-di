/**
 * @overview Endpoint-labeled application logs and payload-free pending RPC diagnostics.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { LabSideEnum } from "@/enums/lab-recording.enum";
import type { LabLogEntry } from "@/types/lab-recording.type";
import type { RenderDevtoolsOptions } from "@/web/types/devtools.type";

export function ConsolePanel(options: RenderDevtoolsOptions) {
	return (
		<>
			<RpcDiagnostics {...options} />
			<DevtoolsConsole
				entries={options.entries.slice(-120)}
				payload={options.view.payload}
			/>
		</>
	);
}

export function DevtoolsConsole({
	entries,
	payload,
}: {
	readonly entries: readonly (LabLogEntry & { readonly side: LabSideEnum })[];
	readonly payload: boolean;
}) {
	return (
		<div className="console-lines">
			{entries.length ? (
				entries.map((entry) => (
					<div className="console-line mono" key={`${entry.side}:${entry.id}`}>
						<time>
							{new Date(entry.at).toLocaleTimeString("en-GB", {
								hour12: false,
							})}
						</time>
						<strong className="source-label">{entry.source}</strong>
						<span>
							{payload || entry.source !== "APP"
								? entry.summary
								: "APP record · payload hidden"}
						</span>
						<small>{entry.side}</small>
					</div>
				))
			) : (
				<div className="empty-state">等待公开事件或示例插桩记录…</div>
			)}
		</div>
	);
}

function RpcDiagnostics(options: RenderDevtoolsOptions) {
	return (
		<div className="rpc-diagnostics">
			{(
				[
					[LabSideEnum.browser, options.browserDiagnostics],
					[LabSideEnum.node, options.nodeDiagnostics],
				] as const
			).map(([side, diagnostics]) => {
				return (
					<section key={side}>
						<h3>
							{side} · {diagnostics?.pendingCalls.length ?? 0} RPC pending ·{" "}
							{diagnostics?.totalEvents ?? 0} events
						</h3>
						<pre className="rpc-pending">
							{diagnostics?.pendingCalls
								.map(
									(call) =>
										`${call.service ?? "unknown"}.${call.method ?? "unknown"} · ${call.observationId}`,
								)
								.join("\n") || "No pending RPC calls"}
						</pre>
						<details data-rpc-side={side}>
							<summary>Recent 24 payload-free events</summary>
							<pre>
								{diagnostics?.recentEvents.slice(0, 24).join("\n") ||
									"No RPC events yet"}
							</pre>
						</details>
					</section>
				);
			})}
		</div>
	);
}
