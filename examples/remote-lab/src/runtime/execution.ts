/**
 * @overview Executes saved TypeScript cases behind a killable IPC boundary with explicit debug steps.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { existsSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
	LabCaseOutcomeEnum,
	LabExecutionCommandEnum,
	LabExecutionEventEnum,
	LabExecutionModeEnum,
	LabExecutionStateEnum,
} from "@/enums/platform/execution.enum";
import { createLabExecutionEnvironment } from "@/factories/platform/lab-execution-environment.factory";
import type {
	ILabCase,
	ILabCaseContext,
} from "@/interfaces/platform/lab-case.interface";
import type {
	LabExecutionCommand,
	LabExecutionEvent,
	LabExecutionStart,
	LabSourceLocation,
} from "@/types/platform/execution.type";
import { loadLabModule } from "@/utils/platform/load-lab-module.util";

let start: LabExecutionStart | undefined;
let entry: string | undefined;
let stepId: string | undefined;
let pauseRequested = false;
let resume: (() => void) | undefined;
let stopped: (() => void) | undefined;
let timeoutCurrent: (() => void) | undefined;
let pausedAt: number | undefined;
let pausedMs = 0;
const controller = new AbortController();

function send(event: Omit<LabExecutionEvent, "timestamp">): void {
	const seen = new WeakSet<object>();
	const text = JSON.stringify(
		{ timestamp: Date.now(), entry, stepId, ...event },
		(_key, value: unknown) => {
			if (typeof value === "bigint") return `${value}n`;
			if (typeof value === "object" && value !== null) {
				if (seen.has(value)) return "[circular]";
				seen.add(value);
			}
			if (value instanceof Error)
				return { name: value.name, message: value.message, stack: value.stack };
			return value;
		},
	);
	// A single hostile log cannot exhaust the control service before its history cap applies.
	if (text.length <= 256_000) {
		process.send?.(JSON.parse(text));
		return;
	}
	if (event.type === LabExecutionEventEnum.record) {
		process.send?.({
			timestamp: Date.now(),
			entry,
			stepId,
			type: LabExecutionEventEnum.record,
			truncated: true,
			data: {
				truncated: true,
				originalBytes: Buffer.byteLength(text),
				preview: text.slice(0, 16_000),
			},
		});
		return;
	}
	const bounded = JSON.parse(text) as Record<string, unknown>;
	bounded.truncated = true;
	for (const key of ["actual", "expected", "data"]) {
		const value = JSON.stringify(bounded[key]);
		if (value && value.length > 16_000)
			bounded[key] = {
				truncated: true,
				originalBytes: Buffer.byteLength(value),
				preview: value.slice(0, 16_000),
			};
	}
	for (const key of ["message", "error", "name"]) {
		const value = bounded[key];
		if (typeof value === "string" && value.length > 16_000)
			bounded[key] = `${value.slice(0, 16_000)} [truncated]`;
	}
	process.send?.(bounded);
}

function source(stack = new Error().stack): LabSourceLocation | undefined {
	if (!start) return;
	const root = realpathSync(start.snapshotDir);
	for (const line of stack?.split("\n") ?? []) {
		const match = line.match(/(?:file:\/\/)?([^()\s]+):(\d+):(\d+)\)?$/);
		const raw =
			decodeURI(match?.[1] ?? "")
				.replace(/^file:\/\//, "")
				.split("?")[0] ?? "";
		const file = existsSync(raw) ? realpathSync(raw) : raw;
		if (!match || !file.startsWith(`${root}/`)) continue;
		return {
			file: relative(root, file),
			line: Number(match[2]),
			column: Number(match[3]),
		};
	}
	return;
}

async function run(configuration: LabExecutionStart): Promise<void> {
	process.chdir(configuration.snapshotDir);
	pauseRequested = configuration.mode === LabExecutionModeEnum.debug;
	let infrastructure = false;
	for (const currentEntry of configuration.entries) {
		if (controller.signal.aborted) break;
		entry = currentEntry;
		stepId = undefined;
		pausedMs = 0;
		const startedAt = Date.now();
		const caseController = new AbortController();
		const stopCase = () => caseController.abort(controller.signal.reason);
		controller.signal.addEventListener("abort", stopCase, { once: true });
		let timedOut = false;
		let acceptingSteps = true;
		timeoutCurrent = () => {
			timedOut = true;
			caseController.abort(
				new Error("Test execution timeout exceeded (manual pauses excluded)."),
			);
		};
		const cleanups = new Set<() => void | Promise<void>>();
		let assertionCount = 0;
		let failedAssertions = 0;
		let failedSteps = 0;
		const pendingSteps = new Set<Promise<unknown>>();
		const activeSteps = new Set<{
			id: string;
			name: string;
			source: LabSourceLocation | undefined;
			finished: boolean;
		}>();
		let nextStep = 0;
		let loaded = false;
		let outcome = LabCaseOutcomeEnum.failed;
		let failure: unknown;
		const own: ILabCaseContext["own"] = (cleanup) => {
			cleanups.add(cleanup);
			return () => {
				cleanups.delete(cleanup);
			};
		};
		const environment = createLabExecutionEnvironment({
			snapshotDir: configuration.snapshotDir,
			...(configuration.browserWSEndpoint
				? { browserWSEndpoint: configuration.browserWSEndpoint }
				: {}),
			own,
			emit: (data) =>
				send({ type: LabExecutionEventEnum.record, entry: currentEntry, data }),
		});
		const context: ILabCaseContext = {
			signal: caseController.signal,
			parameters: configuration.parameters,
			environment: {
				node(...args) {
					caseController.signal.throwIfAborted();
					return environment.node(...args);
				},
				browser(...args) {
					caseController.signal.throwIfAborted();
					return environment.browser(...args);
				},
			},
			own,
			log: (message, data) =>
				send({
					type: LabExecutionEventEnum.record,
					entry: currentEntry,
					message,
					data,
				}),
			assert(condition, message, actual, expected) {
				caseController.signal.throwIfAborted();
				if (!acceptingSteps)
					throw new Error("The case verdict is already final.");
				assertionCount++;
				if (!condition) failedAssertions++;
				send({
					type: LabExecutionEventEnum.assertion,
					entry: currentEntry,
					passed: Boolean(condition),
					message,
					actual,
					expected,
					source: source(),
				});
				if (!condition) throw new Error(`Assertion failed: ${message}`);
			},
			step(name, operation) {
				caseController.signal.throwIfAborted();
				if (!acceptingSteps)
					throw new Error("The case verdict is already final.");
				const current = `${currentEntry}:${++nextStep}`;
				stepId = current;
				const location = source();
				const activity = {
					id: current,
					name,
					source: location,
					finished: false,
				};
				activeSteps.add(activity);
				const publishTerminal = (phase: string, error?: unknown) => {
					if (activity.finished) return;
					activity.finished = true;
					activeSteps.delete(activity);
					send({
						type: LabExecutionEventEnum.step,
						entry: currentEntry,
						stepId: current,
						name,
						phase,
						source:
							error instanceof Error
								? (source(error.stack) ?? location)
								: location,
						...(error !== undefined
							? { error: error instanceof Error ? error.stack : String(error) }
							: {}),
					});
				};
				const task = (async () => {
					try {
						caseController.signal.throwIfAborted();
						send({
							type: LabExecutionEventEnum.step,
							entry: currentEntry,
							stepId: current,
							name,
							phase: "pending",
							source: location,
						});
						if (pauseRequested) {
							pausedAt = Date.now();
							send({
								type: LabExecutionEventEnum.state,
								state: LabExecutionStateEnum.paused,
							});
							await new Promise<void>((resolvePause) => {
								resume = resolvePause;
							});
							pausedMs += Date.now() - pausedAt;
							pausedAt = undefined;
							caseController.signal.throwIfAborted();
							send({
								type: LabExecutionEventEnum.state,
								state: LabExecutionStateEnum.running,
							});
						}
						caseController.signal.throwIfAborted();
						send({
							type: LabExecutionEventEnum.step,
							entry: currentEntry,
							stepId: current,
							name,
							phase: "running",
							source: location,
						});
						const result = await operation();
						publishTerminal("completed");
						return result;
					} catch (error) {
						if (!activity.finished) failedSteps++;
						publishTerminal(
							controller.signal.aborted ? "interrupted" : "failed",
							error,
						);
						throw error;
					}
				})();
				pendingSteps.add(task);
				// Observing rejection prevents a forgotten await from bypassing the case's own verdict.
				void task.then(
					() => pendingSteps.delete(task),
					() => pendingSteps.delete(task),
				);
				return task;
			},
		};
		let abortListener: (() => void) | undefined;
		try {
			await Promise.race([
				(async () => {
					send({
						type: LabExecutionEventEnum.state,
						state: LabExecutionStateEnum.running,
						timeoutMs: configuration.timeoutMs ?? 10_000,
					});
					const absolute = resolve(configuration.snapshotDir, currentEntry);
					const relativeEntry = relative(configuration.snapshotDir, absolute);
					if (relativeEntry === ".." || relativeEntry.startsWith(`..${sep}`))
						throw new Error(
							"Case entry must belong to the saved project snapshot.",
						);
					const module = await loadLabModule(
						configuration.snapshotDir,
						absolute,
					);
					caseController.signal.throwIfAborted();
					const testCase = module.labCase as ILabCase | undefined;
					if (
						!testCase ||
						typeof testCase.title !== "string" ||
						typeof testCase.run !== "function"
					)
						throw new TypeError(
							"Case module must export labCase with title and run(context).",
						);
					if (
						testCase.timeoutMs !== undefined &&
						(!Number.isFinite(testCase.timeoutMs) || testCase.timeoutMs <= 0)
					)
						throw new TypeError("Case timeoutMs must be finite and positive.");
					loaded = true;
					send({
						type: LabExecutionEventEnum.state,
						state: LabExecutionStateEnum.running,
						name: testCase.title,
						timeoutMs: testCase.timeoutMs ?? configuration.timeoutMs ?? 10_000,
					});
					await testCase.run(context);
					while (pendingSteps.size) await Promise.allSettled([...pendingSteps]);
					if (failedSteps > 0)
						throw new Error("The case completed with failed steps.");
					if (failedAssertions > 0)
						throw new Error("The case completed with failed assertions.");
					outcome =
						assertionCount > 0
							? LabCaseOutcomeEnum.passed
							: LabCaseOutcomeEnum.unverified;
				})(),
				new Promise<never>((_resolve, reject) => {
					abortListener = () => reject(caseController.signal.reason);
					caseController.signal.addEventListener("abort", abortListener, {
						once: true,
					});
				}),
			]);
		} catch (error) {
			failure = error;
			outcome = controller.signal.aborted
				? LabCaseOutcomeEnum.interrupted
				: LabCaseOutcomeEnum.failed;
			infrastructure ||=
				(!loaded || activeSteps.size > 0) &&
				!controller.signal.aborted &&
				!timedOut;
		} finally {
			if (abortListener)
				caseController.signal.removeEventListener("abort", abortListener);
			timeoutCurrent = undefined;
			acceptingSteps = false;
		}
		for (const activity of activeSteps) {
			activity.finished = true;
			send({
				type: LabExecutionEventEnum.step,
				entry: currentEntry,
				stepId: activity.id,
				name: activity.name,
				phase: timedOut ? "failed" : "interrupted",
				source: activity.source,
				error: timedOut
					? "Test execution timeout exceeded before the step settled."
					: controller.signal.aborted
						? "Execution stopped before the step settled."
						: "Case exited with a failed entry before the step settled.",
			});
		}
		activeSteps.clear();
		send({
			type: LabExecutionEventEnum.caseResult,
			outcome,
			assertions: assertionCount,
			durationMs: Date.now() - startedAt - pausedMs,
			infrastructure,
			...(failure !== undefined
				? {
						error: failure instanceof Error ? failure.stack : String(failure),
						source: source(
							failure instanceof Error ? failure.stack : undefined,
						),
					}
				: {}),
		});
		if (
			failure !== undefined &&
			!controller.signal.aborted &&
			configuration.mode === LabExecutionModeEnum.debug
		) {
			send({
				type: LabExecutionEventEnum.state,
				state: LabExecutionStateEnum.retained,
			});
			await new Promise<void>((resolveStop) => {
				stopped = resolveStop;
			});
		}
		const errors: string[] = [];
		for (const cleanup of [...cleanups].reverse()) {
			try {
				await cleanup();
			} catch (error) {
				errors.push(
					error instanceof Error
						? (error.stack ?? error.message)
						: String(error),
				);
			}
		}
		send({
			type: LabExecutionEventEnum.cleanup,
			complete: errors.length === 0,
			...(errors.length ? { error: errors.join("\n") } : {}),
		});
		controller.signal.removeEventListener("abort", stopCase);
		if (errors.length) infrastructure = true;
		if (infrastructure || timedOut) break;
	}
	process.send?.(
		{
			type: LabExecutionEventEnum.completed,
			timestamp: Date.now(),
			infrastructure,
		},
		() => process.exit(infrastructure ? 1 : 0),
	);
}

process.on("message", (message: LabExecutionCommand) => {
	if (message.type === LabExecutionCommandEnum.start && !start) {
		start = message;
		void run(message).catch((error) => {
			send({
				type: LabExecutionEventEnum.error,
				error: error instanceof Error ? error.stack : String(error),
				infrastructure: true,
			});
			process.exitCode = 1;
		});
	} else if (message.type === LabExecutionCommandEnum.pause) {
		pauseRequested = true;
	} else if (
		message.type === LabExecutionCommandEnum.continue ||
		message.type === LabExecutionCommandEnum.step
	) {
		pauseRequested = message.type === LabExecutionCommandEnum.step;
		resume?.();
		resume = undefined;
	} else if (message.type === LabExecutionCommandEnum.timeout) {
		timeoutCurrent?.();
	} else if (message.type === LabExecutionCommandEnum.stop) {
		send({
			type: LabExecutionEventEnum.state,
			state: LabExecutionStateEnum.stopping,
		});
		controller.abort(new Error("Lab execution stopped."));
		resume?.();
		resume = undefined;
		stopped?.();
		stopped = undefined;
	}
});

process.on("disconnect", () => process.exit(1));
send({ type: LabExecutionEventEnum.ready });
