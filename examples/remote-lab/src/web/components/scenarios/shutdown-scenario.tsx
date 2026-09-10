/**
 * @overview ShutdownScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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
			<h1>给在途工作一个明确的结尾。</h1>
			<p className="intro">
				先停止重连监督，再排空或强制关闭
				Connector。终止后重新加载页面创建新会话。
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
					重新加载
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="capacity-run"
					data-needs-peer
					disabled={unavailable || capacityPending}
				>
					12 个并发调用 · 容量演练
				</Button>
			</div>
			<p className="help">
				创建时配置：8 pending invocations / Session · recovery grace 5 s ·
				binding attempt 3 s。演练返回每条调用实际结果，接受数量取决于当时状态。
			</p>
			<pre id="capacity-result" className="scenario-result">
				{texts["#capacity-result"] ?? "尚未运行容量演练。"}
			</pre>
			<p className="help">
				可以先启动长任务再切换到此处比较结果。关闭会停止 HTTP
				观测轮询并保留最后快照。
			</p>
		</section>
	);
}
