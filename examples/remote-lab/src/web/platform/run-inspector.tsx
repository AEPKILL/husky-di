/**
 * @overview Shows step, assertion, and actual execution evidence in one selected-run context.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { useState } from "react";
import {
	LabExecutionEventEnum,
	LabExecutionModeEnum,
} from "@/enums/platform/execution.enum";
import { PlatformRunStateEnum } from "@/enums/platform-run.enum";
import type { LabExecutionEvent } from "@/types/platform/execution.type";
import type { PlatformRun } from "@/types/platform-run.type";
import type { PlatformSourceLocation } from "./platform-api";

export type RunInspectorProps = {
	run?: PlatformRun;
	stepId?: string;
	pending: boolean;
	onSelectStep(stepId?: string): void;
	onNavigate(location: PlatformSourceLocation): void;
	onControl(action: string): void;
	onRerun(): void;
};

export function RunInspector({
	run,
	stepId,
	pending,
	onSelectStep,
	onNavigate,
	onControl,
	onRerun,
}: RunInspectorProps) {
	const steps = new Map<string, LabExecutionEvent>();
	for (const event of run?.events ?? []) {
		if (event.type === LabExecutionEventEnum.step && event.stepId)
			steps.set(event.stepId, event);
	}
	const assertions =
		run?.events
			.map((event, ordinal) => ({ event, ordinal }))
			.filter(
				({ event }) =>
					event.type === LabExecutionEventEnum.assertion &&
					(!stepId || stepId === event.stepId),
			) ?? [];
	const canContinue = run?.active && run.state === PlatformRunStateEnum.paused;
	const canPause =
		run?.active &&
		run.mode === LabExecutionModeEnum.debug &&
		run.state === PlatformRunStateEnum.running;
	return (
		<section
			className="platform-run platform-scroll"
			aria-label="Execution steps and assertions"
		>
			<div className="platform-panel-title">
				<h2>Execution / Execution</h2>
				<span>{run?.mode ?? "idle"}</span>
			</div>
			{run ? (
				<>
					<div className="platform-run-id" title={run.id}>
						{run.id}
					</div>
					<dl className="platform-state-grid" data-testid="run-status">
						<dt>Execution</dt>
						<dd data-testid="run-state">{run.state}</dd>
						<dt>Verdict</dt>
						<dd data-testid="run-result" data-result={run.result}>
							{run.result === "unverified"
								? "Unverified · unverified"
								: run.result}
						</dd>
						<dt>Termination</dt>
						<dd data-testid="run-termination">{run.termination}</dd>
						<dt>Cleanup</dt>
						<dd data-testid="run-cleanup">{run.cleanup}</dd>
					</dl>
					<details className="platform-run-metadata">
						<summary>
							Entry, parameters, environment, and dependency versions
						</summary>
						<pre>
							{JSON.stringify(
								{
									entries: run.entries,
									parameters: run.snapshot.parameters,
									environment: run.snapshot.environment,
									dependencies: run.snapshot.dependencies,
									snapshotId: run.snapshot.id,
									createdAt: new Date(run.createdAt).toISOString(),
								},
								null,
								2,
							)}
						</pre>
					</details>
					<div className="platform-controls">
						<button
							type="button"
							disabled={!canPause || pending}
							onClick={() => onControl("pause")}
						>
							Pause
						</button>
						<button
							type="button"
							disabled={!canContinue || pending}
							onClick={() => onControl("next")}
						>
							Next
						</button>
						<button
							type="button"
							disabled={!canContinue || pending}
							onClick={() => onControl("continue")}
						>
							Continue
						</button>
						<button
							type="button"
							className="platform-danger"
							disabled={
								!run.active ||
								pending ||
								run.state === PlatformRunStateEnum.stopping
							}
							onClick={() => onControl("stop")}
						>
							Stop
						</button>
						<button type="button" disabled={pending} onClick={onRerun}>
							Rerun Current Code
						</button>
					</div>
					{run.state === PlatformRunStateEnum.paused ? (
						<p className="platform-note">
							Paused at a step boundary. RPC, streams, and recovery timers
							continue; manual inspection does not count against test timeout.
						</p>
					) : null}
					{run.state === PlatformRunStateEnum.retained ? (
						<p className="platform-note">
							Failure scene retained. You can inspect surviving environments; a
							thrown step cannot continue. Stop or rerun cleans it up.
						</p>
					) : null}
					{run.state === PlatformRunStateEnum.stopping ? (
						<p role="status">Stopping and confirming resource cleanup...</p>
					) : null}
					{run.error ? (
						<pre className="platform-error" role="alert">
							{run.error}
						</pre>
					) : null}
					<div className="platform-section-title">
						<h3>Test Steps</h3>
						<button type="button" onClick={() => onSelectStep(undefined)}>
							All Contexts
						</button>
					</div>
					<ol className="platform-step-list">
						{[...steps].map(([id, event], index) => (
							<li key={id}>
								<button
									type="button"
									className={stepId === id ? "selected" : ""}
									aria-pressed={stepId === id}
									onClick={() => {
										onSelectStep(id);
										if (event.source)
											onNavigate({
												path: event.source.file,
												line: event.source.line,
												column: event.source.column,
											});
									}}
								>
									<span className="platform-step-number">{index + 1}</span>
									<span>
										{event.name ?? id}
										<small>{event.phase ?? event.state ?? "observed"}</small>
									</span>
								</button>
							</li>
						))}
					</ol>
					{steps.size === 0 ? (
						<p className="platform-empty">No test steps observed yet.</p>
					) : null}
					<h3>
						Assertions <span>{assertions.length}</span>
					</h3>
					<div className="platform-assertions">
						{assertions.map(({ event: assertion, ordinal }) => (
							<button
								type="button"
								key={ordinal}
								data-passed={assertion.passed}
								onClick={() => {
									if (assertion.source)
										onNavigate({
											path: assertion.source.file,
											line: assertion.source.line,
											column: assertion.source.column,
										});
								}}
							>
								<strong>
									{assertion.passed ? "✓" : "×"}{" "}
									{assertion.message ?? assertion.name}
								</strong>
								{assertion.expected !== undefined ? (
									<span>expected: {formatValue(assertion.expected)}</span>
								) : null}
								{assertion.actual !== undefined ? (
									<span>actual: {formatValue(assertion.actual)}</span>
								) : null}
							</button>
						))}
					</div>
					{assertions.length === 0 ? (
						<p className="platform-empty">
							This context has no assertions. Completed execution does not mean
							verification passed.
						</p>
					) : null}
				</>
			) : (
				<div className="platform-empty">
					<p>Select a TypeScript case, then run or debug.</p>
					<p>
						The same case is used for step debugging, automatic tests, and CLI.
					</p>
				</div>
			)}
		</section>
	);
}

export function RunEvidence({
	run,
	stepId,
	onSelectStep,
}: Pick<RunInspectorProps, "run" | "stepId" | "onSelectStep">) {
	const [tab, setTab] = useState(EvidenceTabEnum.flow);
	const [selected, setSelected] = useState<number>();
	const [filter, setFilter] = useState("");
	const records = (run?.events ?? [])
		.map((event, index) => ({ event, index }))
		.filter(({ event }) => {
			if (stepId && event.stepId !== stepId) return false;
			if (
				filter &&
				!formatValue(event).toLowerCase().includes(filter.toLowerCase())
			)
				return false;
			const payload = recordPayload(event.data);
			if (tab === EvidenceTabEnum.network) return payload.kind === "wire";
			if (tab === EvidenceTabEnum.logs)
				return (
					(event.type === LabExecutionEventEnum.record &&
						typeof event.message === "string") ||
					payload.kind === "log" ||
					payload.kind === "console" ||
					payload.kind === "error" ||
					event.type === LabExecutionEventEnum.error
				);
			if (tab === EvidenceTabEnum.owners)
				return (
					payload.kind === "owner" ||
					payload.kind === "rpc" ||
					payload.kind === "resource"
				);
			return (
				event.type === LabExecutionEventEnum.record ||
				event.type === LabExecutionEventEnum.step ||
				event.type === LabExecutionEventEnum.caseResult
			);
		});
	const selectedEvent =
		selected === undefined ? undefined : run?.events[selected];
	return (
		<section className="platform-evidence" aria-label="Run data flow and logs">
			<div className="platform-evidence-toolbar">
				<div role="tablist" aria-label="Observation panels">
					{Object.values(EvidenceTabEnum).map((value) => (
						<button
							type="button"
							key={value}
							role="tab"
							aria-selected={tab === value}
							onClick={() => {
								setTab(value);
								setSelected(undefined);
							}}
						>
							{value}
						</button>
					))}
				</div>
				<span className="platform-context">
					{run
						? `${run.id.slice(0, 8)} / ${stepId ?? "all steps"}`
						: "No run selected"}
				</span>
				<input
					aria-label="Filter execution records"
					placeholder="Filter real records..."
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
				/>
			</div>
			{run?.recordingTruncated ? (
				<div className="platform-warning" role="status">
					Records were truncated; current evidence is incomplete.
				</div>
			) : null}
			<div className="platform-evidence-body" role="tabpanel">
				<div className="platform-scroll">
					{records.length ? (
						<table className="platform-records">
							<thead>
								<tr>
									<th>Time</th>
									<th>Step / Type</th>
									<th>Real Event</th>
								</tr>
							</thead>
							<tbody>
								{records.map(({ event, index }) => (
									<tr key={index} data-selected={selected === index}>
										<td>{new Date(event.timestamp).toLocaleTimeString()}</td>
										<td>
											<button
												type="button"
												onClick={() => onSelectStep(event.stepId)}
											>
												{event.stepId ?? "run"}
											</button>
											<small>{event.type}</small>
										</td>
										<td>
											<button
												type="button"
												className="platform-record-summary"
												onClick={() => setSelected(index)}
											>
												{event.message ??
													event.name ??
													summarizeRecord(event.data)}
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<p className="platform-empty">
							This context has not received {tab} records yet. Missing
							observation does not mean the operation succeeded.
						</p>
					)}
				</div>
				{selectedEvent ? (
					<div className="platform-record-detail platform-scroll">
						<div className="platform-section-title">
							<strong>Raw Execution Evidence</strong>
							<button
								type="button"
								onClick={() => setSelected(undefined)}
								aria-label="Close record details"
							>
								×
							</button>
						</div>
						<pre>{JSON.stringify(selectedEvent, null, 2)}</pre>
					</div>
				) : null}
			</div>
		</section>
	);
}

enum EvidenceTabEnum {
	flow = "Flow",
	network = "Network",
	logs = "Logs",
	owners = "Owners / State",
}

function asObject(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

function formatValue(value: unknown): string {
	return typeof value === "string"
		? value
		: (JSON.stringify(value) ?? String(value));
}

function summarizeRecord(value: unknown): string {
	const data = asObject(value);
	const payload = recordPayload(value);
	const text = [
		data.nodeId,
		payload.kind,
		payload.name,
		payload.direction,
		payload.message,
	]
		.filter((part) => typeof part === "string")
		.join(" · ");
	return text || formatValue(value).slice(0, 180);
}

function recordPayload(value: unknown): Record<string, unknown> {
	const data = asObject(value);
	return asObject(
		data.kind === "node" || data.kind === "browser"
			? data.data
			: (data.record ?? value),
	);
}
