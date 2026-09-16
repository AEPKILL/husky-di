/**
 * @overview Controls shared package-scenario runs and inspects their retained RPC data flow.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { useEffect, useRef, useState } from "react";
import { LabE2eStatusEnum, LabE2eTestStatusEnum } from "@/enums/lab-e2e.enum";
import type {
	LabE2eRun,
	LabE2eSnapshot,
	LabE2eTest,
} from "@/types/lab-e2e.type";
import { Button } from "@/web/components/ui/button";
import { LabE2eEvidenceViewEnum } from "@/web/enums/devtools.enum";

export function E2ePanel() {
	const [snapshot, setSnapshot] = useState<LabE2eSnapshot>();
	const [observationError, setObservationError] = useState("");
	const [actionError, setActionError] = useState("");
	const [restarted, setRestarted] = useState(false);
	const [busy, setBusy] = useState(false);
	const [showLast, setShowLast] = useState(false);
	const [observedAt, setObservedAt] = useState<number>();
	const owner = useRef<string | undefined>(undefined);
	useEffect(() => {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const response = await fetch("/api/e2e", { signal: controller.signal });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const next = (await response.json()) as LabE2eSnapshot;
				if (owner.current && owner.current !== next.ownerId) setRestarted(true);
				owner.current = next.ownerId;
				setSnapshot(next);
				setObservedAt(Date.now());
				setObservationError("");
			} catch (error) {
				if (!controller.signal.aborted)
					setObservationError(
						`Observation interrupted; keeping last observation without inferring final run state.${String(error)}`,
					);
			} finally {
				if (!controller.signal.aborted)
					timer = setTimeout(() => void poll(), 600);
			}
		};
		void poll();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	}, []);
	async function control(action: "start" | "stop") {
		setBusy(true);
		setActionError("");
		try {
			const response = await fetch(`/api/e2e/${action}`, { method: "POST" });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			setSnapshot((await response.json()) as LabE2eSnapshot);
			setObservedAt(Date.now());
			setShowLast(false);
		} catch (error) {
			setActionError(
				`Management result pending verification; wait for status query, no automatic retry.${String(error)}`,
			);
		} finally {
			setBusy(false);
		}
	}
	const active = snapshot?.active;
	const report = showLast ? snapshot?.last : (active ?? snapshot?.last);
	return (
		<div className="e2e-panel services-panel">
			<h3>Remote / WebSocket Observable Tests</h3>
			<p className="inspector-note">
				Replay representative real RPC scenarios from packages/remote and
				packages/remote-websocket serially in the main Lab. The testing Peer is
				independent from the manual Session. Run records remain here and are
				also marked as E2E in the manual Network panel.
			</p>
			<div className="scenario-actions">
				<Button
					disabled={busy || Boolean(observationError)}
					onClick={() => void control("start")}
				>
					{active ? "View Current Run" : "Run package E2E"}
				</Button>
				<Button
					variant="outline"
					disabled={
						!active ||
						busy ||
						active.status === LabE2eStatusEnum.stopping ||
						Boolean(observationError)
					}
					onClick={() => void control("stop")}
				>
					{active?.status === LabE2eStatusEnum.stopping
						? "Stopping"
						: "Stop E2E"}
				</Button>
				{active && snapshot?.last ? (
					<Button variant="ghost" onClick={() => setShowLast(!showLast)}>
						{showLast ? "View Current Run" : "View Previous Result"}
					</Button>
				) : null}
			</div>
			{observationError ? <p role="status">{observationError}</p> : null}
			{observedAt ? (
				<p>
					Last observation:
					<time dateTime={new Date(observedAt).toISOString()}>
						{new Date(observedAt).toLocaleString()}
					</time>
					{observationError ? "(stale)" : ""}
				</p>
			) : null}
			{actionError ? <p role="alert">{actionError}</p> : null}
			{restarted ? (
				<p role="status">
					Main Node restarted; old runs and evidence cannot be recovered.
				</p>
			) : null}
			{report ? (
				<RunReport report={report} />
			) : (
				<p>
					Not started yet. Opening pages, switching panels, and manual service
					changes do not run automatically.
				</p>
			)}
		</div>
	);
}

export function RunReport({ report }: { readonly report: LabE2eRun }) {
	const [selectedId, setSelectedId] = useState(report.tests[0]?.id ?? "");
	const [view, setView] = useState(LabE2eEvidenceViewEnum.network);
	const selected =
		report.tests.find((item) => item.id === selectedId) ?? report.tests[0];
	const completed = report.tests.filter(
		(item) =>
			![LabE2eTestStatusEnum.running, LabE2eTestStatusEnum.notRun].includes(
				item.status,
			),
	).length;
	const current = report.tests.find(
		(item) => item.status === LabE2eTestStatusEnum.running,
	);
	return (
		<section
			className="e2e-report"
			aria-label="E2E Run Report"
			data-run-id={report.id}
			data-run-status={report.status}
		>
			<p>
				<strong>{statusLabel[report.status]}</strong> · {completed} /{" "}
				{report.tests.length}
				{" · "}Cleanup：
				{report.cleanupComplete ? "complete" : "not confirmed yet"}
			</p>
			<p className="mono">
				Run {report.id} · suite {report.suite}
			</p>
			{current ? (
				<p data-current-case={current.id}>
					Current case:{current.title}
					{current.step ? ` · ${current.step}` : ""}
				</p>
			) : null}
			{report.finishedAt ? (
				<p>Total duration {report.finishedAt - report.startedAt} ms</p>
			) : null}
			{report.errors.map((error) => (
				<pre className="payload" key={error}>
					{error}
				</pre>
			))}
			<label>
				Select Case
				<select
					aria-label="Select E2E Case"
					value={selected?.id ?? ""}
					onChange={(event) => setSelectedId(event.target.value)}
				>
					{report.tests.map((item) => (
						<option key={item.id} value={item.id}>
							{item.package} · {item.title} · {testStatusLabel[item.status]}
						</option>
					))}
				</select>
			</label>
			{selected ? (
				<CaseReport item={selected} view={view} onViewChange={setView} />
			) : null}
			<details>
				<summary>Run logs (latest 100)</summary>
				<pre className="payload">
					{report.logs.join("\n") || "No run logs yet."}
				</pre>
			</details>
		</section>
	);
}

function CaseReport({
	item,
	view,
	onViewChange,
}: {
	readonly item: LabE2eTest;
	readonly view: LabE2eEvidenceViewEnum;
	readonly onViewChange: (value: LabE2eEvidenceViewEnum) => void;
}) {
	return (
		<section data-case-status={item.status}>
			<h4>{item.title}</h4>
			<p>
				{item.package} · {testStatusLabel[item.status]} · {item.durationMs} ms
			</p>
			<p className="mono">Source:{item.source}</p>
			{item.step ? <p>Step:{item.step}</p> : null}
			{item.errors.map((error) => (
				<pre className="payload" key={error}>
					{error}
				</pre>
			))}
			<div
				className="scenario-actions"
				role="toolbar"
				aria-label="E2E Data View"
			>
				{Object.values(LabE2eEvidenceViewEnum).map((value) => (
					<Button
						key={value}
						variant={view === value ? "default" : "outline"}
						aria-pressed={view === value}
						onClick={() => onViewChange(value)}
					>
						{value}
					</Button>
				))}
			</div>
			<Evidence item={item} view={view} />
		</section>
	);
}

function Evidence({
	item,
	view,
}: {
	readonly item: LabE2eTest;
	readonly view: LabE2eEvidenceViewEnum;
}) {
	if (!item.recordings.length)
		return <p>This case has no retained data flow yet.</p>;
	if (view === LabE2eEvidenceViewEnum.network)
		return (
			<ol>
				{item.recordings.flatMap((recording) =>
					recording.snapshot.entries
						.filter((entry) => entry.transportMessage)
						.map((entry) => (
							<li
								key={`${recording.side}:${recording.snapshot.sessionId ?? "unbound"}:${entry.id}`}
							>
								<strong>{recording.side}</strong> ·{" "}
								{entry.transportMessage?.direction} ·{" "}
								{entry.transportMessage?.type} · {entry.transportMessage?.bytes}{" "}
								B
							</li>
						)),
				)}
			</ol>
		);
	if (view === LabE2eEvidenceViewEnum.flow)
		return (
			<ol>
				{item.recordings.flatMap((recording) =>
					recording.snapshot.calls.map((call) => (
						<li
							key={`${recording.side}:${recording.snapshot.sessionId ?? "unbound"}:${call.id}`}
						>
							<strong>{recording.side}</strong> · {call.traceId} ·{" "}
							{call.service}.{call.method} · {call.outcome}
							<ul>
								{call.phases.map((phase) => (
									<li key={`${phase.at}:${phase.phase}`}>{phase.phase}</li>
								))}
							</ul>
						</li>
					)),
				)}
			</ol>
		);
	if (view === LabE2eEvidenceViewEnum.console)
		return (
			<pre className="payload">
				{item.recordings
					.flatMap((recording) =>
						recording.snapshot.entries.map(
							(entry) =>
								`${recording.side} · ${entry.source} · ${entry.summary}`,
						),
					)
					.join("\n")}
			</pre>
		);
	return (
		<ol>
			{item.recordings.flatMap((recording) => [
				<li
					key={`${recording.side}:${recording.snapshot.sessionId ?? "unbound"}:owner`}
				>
					<strong>{recording.side}</strong> · Session{" "}
					{recording.snapshot.sessionId ?? "—"} · connections{" "}
					{recording.snapshot.connections.length}
				</li>,
				...recording.snapshot.entries
					.filter((entry) => entry.handshake)
					.map((entry) => (
						<li
							key={`${recording.side}:${recording.snapshot.sessionId ?? "unbound"}:${entry.id}`}
						>
							{recording.side} · {entry.handshake?.peerId} ·{" "}
							{entry.handshake?.type}
						</li>
					)),
			])}
		</ol>
	);
}

const statusLabel = {
	[LabE2eStatusEnum.running]: "Running",
	[LabE2eStatusEnum.stopping]: "Stopping",
	[LabE2eStatusEnum.passed]: "Passed",
	[LabE2eStatusEnum.failed]: "Failed",
	[LabE2eStatusEnum.stopped]: "Stopped",
	[LabE2eStatusEnum.error]: "Run error",
	[LabE2eStatusEnum.incomplete]: "Incomplete",
} satisfies Record<LabE2eStatusEnum, string>;

const testStatusLabel = {
	[LabE2eTestStatusEnum.notRun]: "Not run",
	[LabE2eTestStatusEnum.running]: "Running",
	[LabE2eTestStatusEnum.passed]: "Passed",
	[LabE2eTestStatusEnum.failed]: "Failed",
	[LabE2eTestStatusEnum.timedOut]: "Timed out",
	[LabE2eTestStatusEnum.interrupted]: "Interrupted",
} satisfies Record<LabE2eTestStatusEnum, string>;
