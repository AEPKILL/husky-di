/**
 * @overview CancelScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function CancelScenario({
	texts,
	scenario,
	unavailable,
	reportBusy,
	reportCancelable,
	reportResumable,
	onAction,
}: Pick<
	WorkbenchProps,
	| "texts"
	| "scenario"
	| "unavailable"
	| "reportBusy"
	| "reportCancelable"
	| "reportResumable"
	| "onAction"
>) {
	return (
		<section data-scene="cancel" hidden={scenario !== "cancel"}>
			<div className="eyebrow">02 / CANCELLATION & COOPERATIVE DEBUGGING</div>
			<h1>暂停业务，生命周期继续。</h1>
			<p className="intro">
				报表处理器支持协作暂停。取消只结束调用端等待，不回滚已经发生的工作。
			</p>
			<div className="inline-form">
				<label>
					处理时间 / ms
					<input
						id="report-delay"
						type="number"
						min="0"
						max="10000"
						defaultValue="3000"
					/>
				</label>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-start"
					data-needs-peer
					className="primary"
					disabled={unavailable || reportBusy}
				>
					启动长任务
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-timeout"
					data-needs-peer
					disabled={unavailable || reportBusy}
				>
					500 ms 应用超时
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-pause"
					data-needs-peer
					disabled={unavailable || reportBusy}
				>
					启动并暂停
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-cancel"
					disabled={!reportCancelable}
				>
					取消等待
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-resume"
					data-needs-peer
					disabled={!reportResumable}
				>
					▶ 继续处理器
				</Button>
			</div>
			<p id="report-result" className="scenario-result" role="status">
				{texts["#report-result"] ??
					"启动后查看 Network 调用结果与 Sources 业务状态。"}
			</p>
		</section>
	);
}
