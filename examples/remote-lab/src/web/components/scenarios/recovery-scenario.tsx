/**
 * @overview RecoveryScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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
			<h1>替换连接，保留这一次调用。</h1>
			<p className="intro">
				关闭当前真实 WebSocket，监督器会尝试续接。Peer 和已解析的 facade
				保持同一引用。
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
					断开 WebSocket
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="recovery-report"
					data-needs-peer
					disabled={unavailable || reportBusy}
				>
					启动 3 秒报表后断线
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="expire"
					data-needs-peer
					disabled={unavailable || reportBusy}
				>
					阻断重连 · 5 秒恢复到期
				</Button>
				<Button onClick={onAction} variant="outline" id="allow-reconnect">
					允许后续重连
				</Button>
			</div>
			<div className="state-strip">
				<div>
					<small>PEER / 权威状态</small>
					<strong id="recovery-state">
						{texts["#recovery-state"] ?? "connecting"}
					</strong>
				</div>
				<div>
					<small>SUPERVISOR / 尝试策略</small>
					<strong id="recovery-supervisor">
						{texts["#recovery-supervisor"] ?? "idle"}
					</strong>
				</div>
				<div>
					<small>HANDLER ENTRIES / 应用计数</small>
					<strong id="handler-entries">
						{server?.peers.find((peer) => peer.id === peerId)?.handlerEntries ??
							0}
					</strong>
				</div>
			</div>
			<p className="help">
				到期演练会终止本 Session；请重新加载创建新
				Session。已接纳调用的结果可能为 outcome-unknown，不能据此盲目重发。
			</p>
		</section>
	);
}
