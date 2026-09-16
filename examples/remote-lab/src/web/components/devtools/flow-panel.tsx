/**
 * @overview Correlates measured application phases by explicit trace across Browser and Node.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
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
					: "Select a call in Network or run the workflow above."}
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
								aria-label="Resize Flow panel"
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
										No correlated records for this endpoint yet. Old greeting
										and control calls may be captured only on the caller side.
									</p>
								)}
							</section>
						</ResizablePanel>
					</Fragment>
				))}
			</ResizablePanelGroup>
			<div className="protocol-sketch">
				Protocol sketch (not a measured phase): Facade to ordered byte
				Connection to remote dispatch to handler to terminal result.
			</div>
			<p className="inspector-note">
				Correlate endpoint records only by explicit application trace. Do not
				infer wire identity, merge endpoint clocks, or treat connection-level
				byte counts as per-call traffic.
			</p>
		</div>
	);
}
