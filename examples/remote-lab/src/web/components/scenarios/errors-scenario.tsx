/**
 * @overview ErrorsScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function ErrorsScenario({
	texts,
	scenario,
	unavailable,
	onAction,
}: Pick<WorkbenchProps, "texts" | "scenario" | "unavailable" | "onAction">) {
	return (
		<section data-scene="errors" hidden={scenario !== "errors"}>
			<div className="eyebrow">07 / ERROR BOUNDARIES</div>
			<h1>失败有边界，结果有依据。</h1>
			<p className="intro">
				比较真实 handler-failed、unknown-service 与
				unknown-method。远端错误消息和堆栈不进入安全 RPC 事件。
			</p>
			<div className="actions">
				<Button
					onClick={onAction}
					variant="outline"
					id="handler-fail"
					data-needs-peer
					className="primary"
					disabled={unavailable}
				>
					处理器抛错
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="unknown-service"
					data-needs-peer
					disabled={unavailable}
				>
					未知 service
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="unknown-method"
					data-needs-peer
					disabled={unavailable}
				>
					未知 method
				</Button>
			</div>
			<p id="error-result" className="scenario-result" role="status">
				{texts["#error-result"] ?? "错误只终止对应调用；连接状态独立显示。"}
			</p>
		</section>
	);
}
