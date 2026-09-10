/**
 * @overview ExposureScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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
			<h1>开放什么，由合约说了算。</h1>
			<p className="intro">
				撤销控制影响未来调用。Acceptor 全局路由与每个 Peer 的独立路由分开管理。
			</p>
			<div className="actions">
				<Button
					onClick={onAction}
					variant="outline"
					id="toggle-global"
					data-needs-peer
					disabled={unavailable}
				>
					{server?.globalExposure ? "撤销全局 shipping" : "恢复全局 shipping"}
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="test-shipping"
					data-needs-peer
					disabled={unavailable}
				>
					调用 shipping.quote
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="test-local"
					data-needs-peer
					disabled={unavailable}
				>
					调用本 Peer inspect
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="exposure-conflict"
					data-needs-peer
					disabled={unavailable}
				>
					触发同名暴露冲突
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
							{peer.peerExposure ? "撤销此 Peer" : "恢复此 Peer"}
						</Button>
					</div>
				))}
			</div>
			<p id="exposure-result" className="scenario-result" role="status">
				{texts["#exposure-result"] ?? "实际路由与白名单同时显示在 Services。"}
			</p>
		</section>
	);
}
