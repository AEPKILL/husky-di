/**
 * @overview Owns project executions outside user processes and serves the shared UI and CLI control protocol.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { type ChildProcess, fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readdir,
	realpath,
	rm,
	symlink,
} from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserServer, chromium } from "@playwright/test";
import {
	LabCaseOutcomeEnum,
	LabExecutionCommandEnum,
	LabExecutionEventEnum,
	LabExecutionModeEnum,
	LabExecutionStateEnum,
} from "@/enums/platform/execution.enum";
import {
	PlatformCleanupEnum,
	PlatformRunResultEnum,
	PlatformRunStateEnum,
	PlatformTerminationEnum,
} from "@/enums/platform-run.enum";
import { createPlatformProject } from "@/factories/platform-project.factory";
import type { IPlatformProject } from "@/interfaces/platform-project.interface";
import type { IPlatformService } from "@/interfaces/platform-service.interface";
import type { LabExecutionEvent } from "@/types/platform/execution.type";
import type {
	PlatformRun,
	PlatformRunRequest,
} from "@/types/platform-run.type";
import { claimPlatformProject } from "@/utils/claim-platform-project.util";

export type CreatePlatformServiceOptions = {
	readonly builtinRoot?: string;
	readonly debugRetentionMs?: number;
	readonly heartbeatLeaseMs?: number;
	readonly stopGraceMs?: number;
	readonly timeoutMs?: number;
	readonly maxEvents?: number;
	readonly maxEventBytes?: number;
};

export function createPlatformService(
	options: CreatePlatformServiceOptions = {},
): IPlatformService {
	const builtinRoot =
		options.builtinRoot ??
		fileURLToPath(new URL("../../cases", import.meta.url));
	const projects = new Map<string, ProjectState>();
	const openings = new Map<string, Promise<void>>();
	const limits = {
		debugRetentionMs: options.debugRetentionMs ?? 30_000,
		heartbeatLeaseMs: options.heartbeatLeaseMs ?? 6_000,
		stopGraceMs: options.stopGraceMs ?? 1_500,
		maxEvents: options.maxEvents ?? 3_000,
		maxEventBytes: options.maxEventBytes ?? 8 * 1024 * 1024,
	};
	let closing = false;
	const timer = setInterval(() => {
		for (const state of projects.values()) {
			for (const [page, lastSeen] of state.observers) {
				if (Date.now() - lastSeen > limits.heartbeatLeaseMs)
					state.observers.delete(page);
			}
			const active = state.execution;
			if (!active?.report.active) continue;
			const report = active.report;
			chargeBudget(state, active);
			if (
				report.mode === LabExecutionModeEnum.debug &&
				state.observers.size === 0
			) {
				active.unobservedAt ??= Date.now();
				if (Date.now() - active.unobservedAt >= limits.debugRetentionMs)
					void stop(state, active);
			} else active.unobservedAt = undefined;
		}
	}, 100);
	timer.unref();

	function chargeBudget(
		state: ProjectState,
		execution: Execution,
		timestamp = Date.now(),
	): void {
		const now = Math.max(execution.lastTick, timestamp);
		const report = execution.report;
		if (
			report.state === PlatformRunStateEnum.running ||
			report.state === PlatformRunStateEnum.starting
		) {
			execution.budgetMs -= now - execution.lastTick;
			if (
				execution.budgetMs <= 0 &&
				!execution.stopping &&
				!execution.timeoutRequested
			) {
				report.result = PlatformRunResultEnum.failed;
				report.error =
					"Test execution timeout exceeded (manual pauses excluded).";
				execution.timeoutRequested = true;
				if (
					report.mode === LabExecutionModeEnum.debug &&
					execution.child?.connected
				) {
					execution.child.send({ type: LabExecutionCommandEnum.timeout });
					execution.timeoutTimer = setTimeout(() => {
						if (report.active && report.state !== PlatformRunStateEnum.retained)
							void stop(state, execution);
					}, limits.stopGraceMs);
				} else void stop(state, execution);
			}
		}
		execution.lastTick = now;
	}

	async function openProject(rootPath: string) {
		if (closing) throw new Error("Platform is shutting down.");
		const canonical = await realpath(rootPath);
		const id = createHash("sha256")
			.update(canonical)
			.digest("hex")
			.slice(0, 24);
		if (!projects.has(id)) {
			if (!openings.has(id))
				openings.set(
					id,
					(async () => {
						const release = await claimPlatformProject(canonical);
						try {
							const project = await createPlatformProject({
								rootPath: canonical,
							});
							projects.set(id, {
								id,
								project,
								release,
								observers: new Map(),
								writes: Promise.resolve(),
							});
						} catch (error) {
							await release();
							throw error;
						}
					})(),
				);
			try {
				await openings.get(id);
			} finally {
				openings.delete(id);
			}
		}
		return { id, rootPath: canonical, builtin: canonical === builtinRoot };
	}

	function projectState(id: string): ProjectState {
		const state = projects.get(id);
		if (!state) throw new Error("Open the project before using it.");
		return state;
	}

	function persist(state: ProjectState, report: PlatformRun): Promise<void> {
		const { snapshot, ...data } = structuredClone(report);
		state.writes = state.writes
			.catch(() => {})
			.then(async () => {
				try {
					const saved = await state.project.saveHistory({
						id: report.id,
						snapshot,
						data,
						active: data.active,
						recordingTruncated: data.recordingTruncated,
					});
					if (saved.recordingTruncated) report.recordingTruncated = true;
				} catch (error) {
					report.error = `History persistence failed: ${message(error)}`;
					report.result = PlatformRunResultEnum.error;
					const execution = state.execution;
					if (execution?.child && execution.report === report && report.active)
						void stop(state, execution);
				}
			});
		return state.writes;
	}

	async function readRun(
		projectId: string,
		runId: string,
	): Promise<PlatformRun> {
		const state = projectState(projectId);
		if (state.execution?.report.id === runId)
			return structuredClone(state.execution.report);
		const history = await state.project.readHistory(runId);
		const report = {
			...history.data,
			snapshot: history.snapshot,
			recordingTruncated: history.recordingTruncated ?? false,
		} as PlatformRun;
		if (history.interrupted) {
			report.active = false;
			report.state = PlatformRunStateEnum.finished;
			report.result = PlatformRunResultEnum.interrupted;
			report.termination = PlatformTerminationEnum.unknown;
			report.cleanup = PlatformCleanupEnum.unknown;
			report.error =
				"Project service exited without confirmed execution termination or cleanup.";
		}
		return report;
	}

	async function start(
		projectId: string,
		request: PlatformRunRequest,
	): Promise<PlatformRun> {
		const state = projectState(projectId);
		if (closing) throw new Error("Platform is shutting down.");
		if (state.starting) return structuredClone(await state.starting);
		if (state.execution?.report.active)
			return structuredClone(state.execution.report);
		if (state.execution?.report.termination === PlatformTerminationEnum.unknown)
			throw new Error(
				"The previous execution's termination is unconfirmed; cannot start another environment.",
			);
		const entries = request.entries ?? (request.entry ? [request.entry] : []);
		if (
			!entries.length ||
			entries.some(
				(entry) => typeof entry !== "string" || !entry.endsWith(".case.ts"),
			)
		)
			throw new Error("Select one or more .case.ts modules.");
		if (
			request.mode !== undefined &&
			!Object.values(LabExecutionModeEnum).includes(request.mode)
		)
			throw new Error("Unknown execution mode.");
		state.starting = (async () => {
			const snapshot = await state.project.snapshot({
				entry: entries[0],
				parameters: request.parameters ?? {},
				environment: {
					node: process.version,
					browser: "Chromium",
					mode: request.mode ?? LabExecutionModeEnum.test,
					entries,
				},
			});
			for (const entry of entries)
				if (!(entry in snapshot.files))
					throw new Error(`Case no longer exists: ${entry}`);
			for (const [path, revision] of Object.entries(
				request.expectedRevisions ?? {},
			)) {
				if (snapshot.revisions[path] !== revision)
					throw new Error(
						`Saved source changed before execution: ${path}. Refresh and resolve the edit before running.`,
					);
			}
			const report: PlatformRun = {
				id: randomUUID(),
				projectId,
				entries: [...new Set(entries)],
				mode: request.mode ?? LabExecutionModeEnum.test,
				state: PlatformRunStateEnum.starting,
				result: PlatformRunResultEnum.pending,
				termination: PlatformTerminationEnum.pending,
				cleanup: PlatformCleanupEnum.pending,
				snapshot,
				events: [],
				createdAt: Date.now(),
				recordingTruncated: false,
				active: true,
			};
			const execution: Execution = {
				report,
				lastTick: Date.now(),
				budgetMs: options.timeoutMs ?? 10_000,
				done: Promise.resolve(),
				exit: Promise.resolve(),
				resolveExit() {},
				bytes: 0,
			};
			execution.exit = new Promise<void>((resolve) => {
				execution.resolveExit = resolve;
			});
			state.execution = execution;
			await persist(state, report);
			if (report.result === PlatformRunResultEnum.error) {
				report.active = false;
				report.state = PlatformRunStateEnum.finished;
				report.termination = PlatformTerminationEnum.normal;
				report.cleanup = PlatformCleanupEnum.complete;
				return report;
			}
			execution.done = launch(state, execution);
			return report;
		})();
		try {
			return structuredClone(await state.starting);
		} finally {
			state.starting = undefined;
		}
	}

	async function launch(
		state: ProjectState,
		execution: Execution,
	): Promise<void> {
		const report = execution.report;
		try {
			execution.directory = await mkdtemp(join(tmpdir(), "remote-lab-run-"));
			await state.project.materializeSnapshot(
				report.snapshot,
				execution.directory,
			);
			await linkDependencies(state.project.rootPath, execution.directory);
			if (execution.stopping) return;
			execution.browser = await chromium.launchServer({
				headless: true,
				timeout: 15_000,
			});
			report.snapshot.environment.chromium = await browserVersion(
				execution.browser,
			);
			if (execution.stopping) return;
			execution.lastTick = Date.now();
			execution.budgetMs = options.timeoutMs ?? 10_000;
			const child = fork(
				fileURLToPath(new URL("../runtime/execution.ts", import.meta.url)),
				[],
				{
					detached: true,
					cwd: fileURLToPath(new URL("../../", import.meta.url)),
					execArgv: ["--import", "tsx"],
					stdio: ["ignore", "pipe", "pipe", "ipc"],
				},
			);
			execution.child = child;
			child.on("message", (event: LabExecutionEvent) => {
				if (
					!event ||
					!Object.values(LabExecutionEventEnum).includes(event.type) ||
					!report.active
				)
					return;
				chargeBudget(state, execution, event.timestamp);
				if (event.type === LabExecutionEventEnum.state && !execution.stopping) {
					if (event.timeoutMs !== undefined) {
						report.cleanup = PlatformCleanupEnum.pending;
						execution.budgetMs = event.timeoutMs;
					}
					report.state =
						event.state === LabExecutionStateEnum.paused
							? PlatformRunStateEnum.paused
							: event.state === LabExecutionStateEnum.retained
								? PlatformRunStateEnum.retained
								: PlatformRunStateEnum.running;
					execution.lastTick = event.timestamp;
				}
				if (event.type === LabExecutionEventEnum.cleanup) {
					if (!event.complete) {
						report.cleanup = PlatformCleanupEnum.failed;
						report.result = PlatformRunResultEnum.error;
					} else if (report.cleanup !== PlatformCleanupEnum.failed)
						report.cleanup = PlatformCleanupEnum.complete;
				}
				if (
					event.type === LabExecutionEventEnum.error ||
					event.infrastructure
				) {
					report.result = PlatformRunResultEnum.error;
					report.error =
						event.error ?? event.message ?? "Execution infrastructure failed.";
				}
				if (event.type === LabExecutionEventEnum.caseResult) {
					if (
						event.outcome === LabCaseOutcomeEnum.failed &&
						report.result !== PlatformRunResultEnum.error
					)
						report.result = PlatformRunResultEnum.failed;
					if (
						event.outcome === LabCaseOutcomeEnum.unverified &&
						report.result === PlatformRunResultEnum.pending
					)
						report.result = PlatformRunResultEnum.unverified;
					if (
						event.outcome === LabCaseOutcomeEnum.interrupted &&
						report.result === PlatformRunResultEnum.pending
					)
						report.result = PlatformRunResultEnum.interrupted;
				}
				if (event.type === LabExecutionEventEnum.completed)
					execution.completed = true;
				record(state, execution, event);
			});
			for (const [stream, label] of [
				[child.stdout, "stdout"],
				[child.stderr, "stderr"],
			] as const)
				stream?.setEncoding("utf8").on("data", (chunk: string) =>
					record(state, execution, {
						type: LabExecutionEventEnum.record,
						timestamp: Date.now(),
						name: label,
						message: chunk.slice(0, 8192),
						truncated: chunk.length > 8192,
					}),
				);
			child.once("error", (error) => {
				report.error = message(error);
				report.result = PlatformRunResultEnum.error;
				execution.resolveExit();
			});
			child.once("exit", (code, signal) => {
				execution.exitCode = code;
				execution.exitSignal = signal;
				execution.resolveExit();
			});
			child.send({
				type: LabExecutionCommandEnum.start,
				snapshotDir: execution.directory,
				entries: report.entries,
				parameters: report.snapshot.parameters,
				mode: report.mode,
				browserWSEndpoint: execution.browser.wsEndpoint(),
				timeoutMs: options.timeoutMs ?? 10_000,
			});
			await execution.exit;
		} catch (error) {
			report.result = PlatformRunResultEnum.error;
			report.error = message(error);
		} finally {
			await finalize(state, execution);
		}
	}

	function record(
		state: ProjectState,
		execution: Execution,
		event: LabExecutionEvent,
	): void {
		const size = Buffer.byteLength(JSON.stringify(event));
		const report = execution.report;
		if (event.truncated) report.recordingTruncated = true;
		while (
			execution.bytes + size > limits.maxEventBytes ||
			report.events.length >= limits.maxEvents
		) {
			const oldest = report.events.findIndex(
				(retained) => retained.type === LabExecutionEventEnum.record,
			);
			if (oldest < 0) break;
			const [removed] = report.events.splice(oldest, 1);
			execution.bytes -= Buffer.byteLength(JSON.stringify(removed));
			report.recordingTruncated = true;
		}
		const exceedsLimit =
			execution.bytes + size > limits.maxEventBytes ||
			report.events.length >= limits.maxEvents;
		if (exceedsLimit) {
			report.recordingTruncated = true;
			if (event.type !== LabExecutionEventEnum.record && !execution.stopping) {
				report.result = PlatformRunResultEnum.error;
				report.error =
					"Required assertion or execution evidence exceeded the recording limit.";
				void stop(state, execution);
			}
		} else {
			report.events.push(event);
			execution.bytes += size;
		}
		if (!execution.persistTimer)
			execution.persistTimer = setTimeout(() => {
				execution.persistTimer = undefined;
				void persist(state, report);
			}, 100);
	}

	async function finalize(
		state: ProjectState,
		execution: Execution,
	): Promise<void> {
		if (execution.finishing) return execution.finishing;
		execution.finishing = (async () => {
			const report = execution.report;
			if (execution.child && !execution.completed && !execution.stopping) {
				report.result = PlatformRunResultEnum.error;
				report.termination = PlatformTerminationEnum.unexpected;
				report.error = `Execution exited before reporting completion (code=${execution.exitCode ?? "unknown"}, signal=${execution.exitSignal ?? "none"}).`;
				record(state, execution, {
					type: LabExecutionEventEnum.error,
					timestamp: Date.now(),
					infrastructure: true,
					error: report.error,
				});
			}
			let ownedCleanup = true;
			if (execution.browser) {
				const browser = execution.browser;
				const closed = await bounded(browser.close(), limits.stopGraceMs);
				if (!closed) {
					ownedCleanup = await bounded(browser.kill(), limits.stopGraceMs);
				}
			}
			if (execution.child?.pid) {
				const pid = execution.child.pid;
				if (groupExists(pid)) {
					execution.forced = true;
					if (report.termination === PlatformTerminationEnum.pending)
						report.termination = PlatformTerminationEnum.forced;
					killGroup(pid);
				}
				const confirmed = await waitForGroupExit(pid, limits.stopGraceMs);
				if (!confirmed) report.termination = PlatformTerminationEnum.unknown;
				ownedCleanup = confirmed && ownedCleanup;
			}
			if (execution.directory) {
				try {
					await rm(execution.directory, { recursive: true, force: true });
				} catch {
					ownedCleanup = false;
				}
			}
			if (execution.persistTimer) clearTimeout(execution.persistTimer);
			if (execution.timeoutTimer) clearTimeout(execution.timeoutTimer);
			report.active = false;
			report.state = PlatformRunStateEnum.finished;
			report.completedAt = Date.now();
			if (report.termination === PlatformTerminationEnum.pending)
				report.termination = execution.exitSignal
					? PlatformTerminationEnum.unknown
					: PlatformTerminationEnum.normal;
			if (!ownedCleanup) report.cleanup = PlatformCleanupEnum.unknown;
			else if (report.cleanup === PlatformCleanupEnum.pending)
				report.cleanup =
					execution.forced || !execution.child
						? PlatformCleanupEnum.complete
						: PlatformCleanupEnum.unknown;
			const allPassed = report.entries.every((entry) => {
				const assertions = report.events.filter(
					(event) =>
						event.type === LabExecutionEventEnum.assertion &&
						event.entry === entry,
				);
				return (
					assertions.length > 0 &&
					assertions.every((event) => event.passed) &&
					report.events.some(
						(event) =>
							event.type === LabExecutionEventEnum.caseResult &&
							event.entry === entry &&
							event.outcome === LabCaseOutcomeEnum.passed &&
							event.assertions === assertions.length,
					)
				);
			});
			if (report.result === PlatformRunResultEnum.pending)
				report.result =
					execution.completed && allPassed
						? PlatformRunResultEnum.passed
						: PlatformRunResultEnum.interrupted;
			if (
				report.cleanup !== PlatformCleanupEnum.complete &&
				report.result === PlatformRunResultEnum.passed
			)
				report.result = PlatformRunResultEnum.error;
			if (
				report.termination !== PlatformTerminationEnum.normal &&
				report.result === PlatformRunResultEnum.passed
			)
				report.result = PlatformRunResultEnum.interrupted;
			await persist(state, report);
		})();
		return execution.finishing;
	}

	async function stop(
		state: ProjectState,
		execution: Execution,
	): Promise<void> {
		if (execution.stopping) return execution.stopping;
		execution.report.state = PlatformRunStateEnum.stopping;
		execution.stopping = (async () => {
			if (execution.child?.connected)
				execution.child.send({ type: LabExecutionCommandEnum.stop });
			const exited = execution.child
				? await bounded(execution.exit, limits.stopGraceMs)
				: false;
			if (!exited && execution.child?.pid) {
				execution.forced = true;
				execution.report.termination = killGroup(execution.child.pid)
					? PlatformTerminationEnum.forced
					: PlatformTerminationEnum.unknown;
				await bounded(execution.exit, limits.stopGraceMs);
			}
			const completed = await bounded(
				execution.done,
				execution.child
					? limits.stopGraceMs * 4
					: 16_000 + limits.stopGraceMs * 4,
			);
			if (!completed) {
				execution.report.termination = PlatformTerminationEnum.unknown;
				execution.report.cleanup = PlatformCleanupEnum.unknown;
				execution.report.result = PlatformRunResultEnum.error;
				execution.report.error =
					"Termination could not be confirmed within the stop deadline.";
				await finalize(state, execution);
			}
		})();
		void persist(state, execution.report);
		return execution.stopping;
	}

	async function control(
		projectId: string,
		runId: string,
		action: Exclude<LabExecutionCommandEnum, LabExecutionCommandEnum.start>,
	): Promise<PlatformRun> {
		const state = projectState(projectId);
		const execution = state.execution;
		if (!execution || execution.report.id !== runId || !execution.report.active)
			return readRun(projectId, runId);
		if (action === LabExecutionCommandEnum.stop) {
			void stop(state, execution);
			return structuredClone(execution.report);
		}
		if (
			execution.report.mode !== LabExecutionModeEnum.debug ||
			execution.report.state === PlatformRunStateEnum.retained ||
			execution.stopping
		)
			throw new Error(
				"Only a live debug step boundary can continue; failed steps require a new run.",
			);
		if (execution.child?.connected) execution.child.send({ type: action });
		return structuredClone(execution.report);
	}

	async function route(request: IncomingMessage): Promise<unknown> {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		const parts = url.pathname
			.slice("/api/platform".length)
			.split("/")
			.filter(Boolean);
		const method = request.method ?? "GET";
		if (!parts.length) {
			await openProject(builtinRoot);
			return {
				projects: [...projects.values()].map((state) => ({
					id: state.id,
					rootPath: state.project.rootPath,
					builtin: state.project.rootPath === builtinRoot,
				})),
				limits,
			};
		}
		if (parts[0] !== "projects") throw new Error("Unknown platform route.");
		if (parts.length === 1 && method === "POST") {
			const body = await readBody(request);
			return openProject(requireString(body.rootPath));
		}
		const state = projectState(parts[1]);
		const project = state.project;
		if (parts.length === 2)
			return { id: state.id, ...(await project.describe()) };
		if (parts[2] === "files") {
			const path = requireString(url.searchParams.get("path"));
			if (method === "GET") return project.readFile(path);
			const body = await readBody(request);
			if (
				body.expectedRevision !== null &&
				typeof body.expectedRevision !== "string"
			)
				throw new Error("A saved revision is required.");
			return project.saveFile(
				path,
				requireString(body.content, true),
				body.expectedRevision,
			);
		}
		if (parts[2] === "language") {
			const body = await readBody(request);
			const overlays = body.overlays as Record<string, string> | undefined;
			if (
				overlays &&
				Object.values(overlays).some((value) => typeof value !== "string")
			)
				throw new Error("Language overlays must be source strings.");
			if (body.action === "diagnostics") return project.diagnostics(overlays);
			if (body.action === "source")
				return project.readDefinition(requireString(body.path));
			if (!Number.isSafeInteger(body.position) || Number(body.position) < 0)
				throw new Error("Invalid source position.");
			if (body.action === "completions")
				return project.completions(
					requireString(body.path),
					Number(body.position),
					overlays,
				);
			if (body.action === "definitions")
				return project.definitions(
					requireString(body.path),
					Number(body.position),
					overlays,
				);
			throw new Error("Unknown language action.");
		}
		if (parts[2] === "observers") {
			const body = await readBody(request);
			const page = requireString(body.pageId);
			if (body.connected === false) state.observers.delete(page);
			else state.observers.set(page, Date.now());
			return { observers: state.observers.size, limits };
		}
		if (parts[2] === "runs") {
			if (parts.length === 3) {
				if (method === "POST")
					return start(
						state.id,
						(await readBody(request)) as PlatformRunRequest,
					);
				const summaries = await project.listHistory();
				return {
					active: state.execution?.report.active
						? structuredClone(state.execution.report)
						: undefined,
					history: summaries.map((summary) => ({
						...summary.data,
						id: summary.id,
						projectId: state.id,
						recordingTruncated: summary.recordingTruncated,
						...(summary.interrupted
							? {
									active: false,
									state: PlatformRunStateEnum.finished,
									result: PlatformRunResultEnum.interrupted,
									termination: PlatformTerminationEnum.unknown,
									cleanup: PlatformCleanupEnum.unknown,
									error:
										"Project service exited without confirmed termination or cleanup.",
								}
							: {}),
					})),
				};
			}
			const runId = parts[3];
			if (parts[4] === "control") {
				const body = await readBody(request);
				const action =
					body.action === "next" ? LabExecutionCommandEnum.step : body.action;
				if (
					!Object.values(LabExecutionCommandEnum).includes(
						action as LabExecutionCommandEnum,
					) ||
					action === LabExecutionCommandEnum.start
				)
					throw new Error("Unknown run control.");
				return control(
					state.id,
					runId,
					action as Exclude<
						LabExecutionCommandEnum,
						LabExecutionCommandEnum.start
					>,
				);
			}
			if (method === "DELETE") {
				if (
					state.execution?.report.id === runId &&
					state.execution.report.active
				)
					throw new Error("Stop the active run before deleting its evidence.");
				await state.writes;
				await project.deleteHistory(runId);
				if (state.execution?.report.id === runId) state.execution = undefined;
				return { deleted: true };
			}
			return readRun(state.id, runId);
		}
		throw new Error("Unknown platform route.");
	}

	return {
		limits,
		openProject,
		start,
		control,
		readRun,
		handleRequest(request, response) {
			if (!request.url?.startsWith("/api/platform")) return false;
			response.setHeader("Content-Type", "application/json; charset=utf-8");
			response.setHeader("Cache-Control", "no-store");
			const origin = request.headers.origin;
			if (
				origin &&
				!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)
			) {
				response.statusCode = 403;
				response.end(
					JSON.stringify({ error: "Local workbench origin required." }),
				);
				return true;
			}
			void route(request).then(
				(result) => response.end(JSON.stringify(result)),
				(error) => {
					response.statusCode = 400;
					response.end(JSON.stringify({ error: message(error) }));
				},
			);
			return true;
		},
		async shutdown() {
			closing = true;
			clearInterval(timer);
			await Promise.allSettled(openings.values());
			await Promise.all(
				[...projects.values()].map(async (state) => {
					try {
						await state.starting?.catch(() => undefined);
						if (state.execution?.report.active)
							await stop(state, state.execution);
						await state.writes;
					} finally {
						state.project.dispose();
						await state.release();
					}
				}),
			);
		},
	};
}

type ProjectState = {
	id: string;
	project: IPlatformProject;
	release(): Promise<void>;
	observers: Map<string, number>;
	execution?: Execution;
	starting?: Promise<PlatformRun>;
	writes: Promise<void>;
};

type Execution = {
	report: PlatformRun;
	child?: ChildProcess;
	browser?: BrowserServer;
	directory?: string;
	done: Promise<void>;
	exit: Promise<void>;
	resolveExit(): void;
	exitCode?: number | null;
	exitSignal?: NodeJS.Signals | null;
	stopping?: Promise<void>;
	finishing?: Promise<void>;
	completed?: boolean;
	forced?: boolean;
	timeoutRequested?: boolean;
	timeoutTimer?: ReturnType<typeof setTimeout>;
	budgetMs: number;
	lastTick: number;
	unobservedAt?: number;
	bytes: number;
	persistTimer?: ReturnType<typeof setTimeout>;
};

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function requireString(value: unknown, empty = false): string {
	if (typeof value !== "string" || (!empty && !value))
		throw new Error("Expected a nonempty string.");
	return value;
}

async function readBody(
	request: IncomingMessage,
): Promise<Record<string, unknown>> {
	let text = "";
	for await (const chunk of request) {
		text += chunk;
		if (Buffer.byteLength(text) > 2 * 1024 * 1024)
			throw new Error("Request exceeds 2 MiB.");
	}
	const value = JSON.parse(text || "{}");
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Expected a JSON object.");
	return value;
}

async function bounded(
	operation: Promise<unknown>,
	milliseconds: number,
): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation.then(
				() => true,
				() => false,
			),
			new Promise<boolean>((resolve) => {
				timer = setTimeout(() => resolve(false), milliseconds);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

function killGroup(pid: number): boolean {
	try {
		process.kill(-pid, "SIGKILL");
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "ESRCH";
	}
}

function groupExists(pid: number): boolean {
	try {
		process.kill(-pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

async function waitForGroupExit(
	pid: number,
	milliseconds: number,
): Promise<boolean> {
	const deadline = Date.now() + milliseconds;
	while (groupExists(pid)) {
		if (Date.now() >= deadline) return false;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	return true;
}

async function browserVersion(server: BrowserServer): Promise<string> {
	const browser = await chromium.connect(server.wsEndpoint());
	try {
		return browser.version();
	} finally {
		await browser.close();
	}
}

async function linkDependencies(
	projectRoot: string,
	snapshotDirectory: string,
): Promise<void> {
	const target = join(snapshotDirectory, "node_modules");
	await mkdir(target);
	const origins: string[] = [];
	for (let directory = projectRoot; ; directory = dirname(directory)) {
		origins.push(join(directory, "node_modules"));
		if (dirname(directory) === directory) break;
	}
	origins.push(fileURLToPath(new URL("../../node_modules", import.meta.url)));
	const linked = new Set<string>();
	for (const origin of origins) {
		const entries = await readdir(origin).catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return [];
				throw error;
			},
		);
		for (const name of entries.filter((name) => !name.startsWith("."))) {
			const names = name.startsWith("@")
				? (await readdir(join(origin, name))).map((child) => `${name}/${child}`)
				: [name];
			for (const packageName of names) {
				if (linked.has(packageName)) continue;
				await mkdir(dirname(join(target, packageName)), { recursive: true });
				await symlink(join(origin, packageName), join(target, packageName));
				linked.add(packageName);
			}
		}
	}
}
