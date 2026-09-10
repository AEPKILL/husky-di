/**
 * @overview PeersScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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
			<h1>一个 Node，多个独立对等端。</h1>
			<p className="intro">
				每个标签页拥有自己的 Peer。定向回调与群发都经真实
				RPC，群发由示例应用组合。
			</p>
			<div className="inline-form">
				<Button onClick={onAction} variant="outline" id="open-peer">
					↗ 打开第二个浏览器 Peer
				</Button>
				<label>
					目标 Peer
					<select id="peer-select" aria-label="目标 Peer">
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
					消息
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
					定向回调
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="peer-fanout"
					data-needs-peer
					disabled={unavailable}
				>
					群发所有 Peer
				</Button>
			</div>
			<pre id="peers-result" className="scenario-result">
				{texts["#peers-result"] ?? "等待 Peer 快照…"}
			</pre>
		</section>
	);
}
