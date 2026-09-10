/**
 * @overview AdapterScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { WorkbenchProps } from "@/web/types/workbench.type";

export function AdapterScenario({
	scenario,
	transportSummary,
}: Pick<WorkbenchProps, "scenario"> & { readonly transportSummary: string }) {
	return (
		<section data-scene="adapter" hidden={scenario !== "adapter"}>
			<div className="eyebrow">09 / ADAPTER & CONFORMANCE</div>
			<h1>字节通道，有清晰的边界。</h1>
			<p className="intro">
				本页使用独立 @husky-di/remote-websocket Adapter。send
				完成只表示本地接纳，不证明远端接收或处理完成。
			</p>
			<div className="adapter-grid">
				<div>
					<small>CONNECTION-LEVEL TRANSPORT</small>
					<pre id="transport-summary">
						{transportSummary || "等待真实字节观测…"}
					</pre>
					<p className="help">
						字节数属于连接；不分摊给调用，不解码或展示握手凭证。
					</p>
				</div>
				<div>
					<small>在仓库根目录执行 / 本页未运行合规测试</small>
					<pre className="command">
						pnpm --filter @husky-di/remote-websocket test
					</pre>
					<p className="help">
						Adapter / Protocol conformance 由 @husky-di/remote/conformance
						提供。公开入口：@husky-di/remote/transport（Connection /
						Adapter）；@husky-di/remote/protocol（可替换
						Protocol）。实际合规报告以包测试为准。
					</p>
				</div>
			</div>
		</section>
	);
}
