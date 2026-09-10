/**
 * @overview Correlates measured application phases by explicit trace across Browser and Node.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Fragment } from "react";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import type { LabCallRecord } from "@/types/lab-recording.type";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/web/components/ui/resizable";
import { formatDevtoolsJson } from "@/web/utils/format-devtools-json.util";
import { formatDevtoolsService } from "@/web/utils/format-devtools-service.util";
import { getCallRecordKey } from "@/web/utils/get-call-record-key.util";

export function FlowPanel({
	calls,
	call,
	payload,
	vertical,
}: {
	readonly calls: readonly LabCallRecord[];
	readonly call: LabCallRecord | undefined;
	readonly payload: boolean;
	readonly vertical: boolean;
}) {
	const match = call
		? calls.filter((record) => record.traceId === call.traceId)
		: [];
	return (
		<div className="flow-panel">
			<div className="flow-title mono">
				{call
					? `${formatDevtoolsService(call.service)}.${call.method} · ${call.traceId}`
					: "先在 Network 中选择一条调用，或执行上方业务。"}
			</div>
			<ResizablePanelGroup
				id="flow-panels"
				className="flow-columns"
				orientation={vertical ? "vertical" : "horizontal"}
			>
				{[LabSideEnum.browser, LabSideEnum.node].map((side, index) => (
					<Fragment key={side}>
						{index > 0 ? (
							<ResizableHandle
								withHandle
								data-resize="flow"
								aria-label="调整 Flow 面板大小"
							/>
						) : null}
						<ResizablePanel id={`flow-${side}`} defaultSize="50%" minSize="20%">
							<section className="flow-endpoint">
								<h3>{side} / APP</h3>
								{match
									.filter((record) => record.side === side)
									.map((record) => (
										<Fragment key={getCallRecordKey(record)}>
											<p className="mono">
												{record.method} · {record.outcome}
											</p>
											{record.phases.map((phase) => (
												<div
													className="flow-stage"
													key={`${phase.phase}:${phase.at}`}
												>
													<strong>{phase.phase}</strong>
													<small>
														+{Math.max(0, phase.at - record.startedAt)} ms ·
														actual APP boundary
													</small>
													{payload && phase.detail ? (
														<pre>{formatDevtoolsJson(phase.detail)}</pre>
													) : null}
												</div>
											))}
										</Fragment>
									))}
								{match.some((record) => record.side === side) ? null : (
									<p className="help">
										尚无该端关联记录。旧 greeting 与控制调用可能只在调用端采集。
									</p>
								)}
							</section>
						</ResizablePanel>
					</Fragment>
				))}
			</ResizablePanelGroup>
			<div className="protocol-sketch">
				Protocol 示意（非测量阶段）：Facade → ordered byte Connection → remote
				dispatch → handler → terminal result。
			</div>
			<p className="inspector-note">
				只按显式 application trace 关联两端记录。不推导 wire
				identity，不合并两端时钟，不把连接级字节数当作单次调用流量。
			</p>
		</div>
	);
}
