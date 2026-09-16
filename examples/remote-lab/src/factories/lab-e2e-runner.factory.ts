/**
 * @overview Owns one serial run of observable Remote package scenarios inside the main Lab process.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import {
	LabE2eStatusEnum,
	LabE2eSuiteEnum,
	LabE2eTestStatusEnum,
} from "@/enums/lab-e2e.enum";
import { LabSideEnum, LabSourceEnum } from "@/enums/lab-recording.enum";
import { createLabE2eCases } from "@/factories/lab-e2e-cases.factory";
import type { ILabE2eRunner } from "@/interfaces/lab-e2e-runner.interface";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";
import type {
	LabE2eCase,
	LabE2eRun,
	LabE2eSnapshot,
	LabE2eTest,
} from "@/types/lab-e2e.type";

export type CreateLabE2eRunnerOptions = {
	readonly endpoint?: string;
	readonly nodeRecorder?: ILabRecorder;
	readonly cases?: readonly LabE2eCase[];
	readonly caseTimeoutMs?: number;
};

export function createLabE2eRunner(
	options: CreateLabE2eRunnerOptions = {},
): ILabE2eRunner {
	const suite = LabE2eSuiteEnum.observablePackageScenarios;
	const cases = Object.freeze(
		resolveCases(options).map((definition) => Object.freeze({ ...definition })),
	);
	const ownerId = randomUUID();
	let active: Execution | undefined;
	let last: LabE2eRun | undefined;
	let closed = false;
	const snapshot = (): LabE2eSnapshot => ({
		ownerId,
		suite,
		...(active ? { active: active.report } : {}),
		...(last ? { last } : {}),
	});
	const stop = () => {
		if (!active || active.report.status === LabE2eStatusEnum.stopping) return;
		active.report.status = LabE2eStatusEnum.stopping;
		active.controller.abort(new DOMException("E2E run stopped.", "AbortError"));
	};
	const start = () => {
		if (active || closed) return;
		const report: LabE2eRun = {
			id: randomUUID(),
			suite,
			status: LabE2eStatusEnum.running,
			startedAt: Date.now(),
			tests: cases.map((item) => ({
				id: item.id,
				title: item.title,
				package: item.package,
				source: item.source,
				status: LabE2eTestStatusEnum.notRun,
				durationMs: 0,
				errors: [],
				recordings: [],
			})),
			logs: [],
			errors: [],
			cleanupComplete: false,
		};
		const controller = new AbortController();
		const execution: Execution = {
			report,
			controller,
			done: Promise.resolve(),
		};
		active = execution;
		execution.done = execute(execution, cases, options.caseTimeoutMs ?? 10_000)
			.catch((error: unknown) => {
				report.errors.push(`E2E runner: ${formatError(error)}`);
				report.status = LabE2eStatusEnum.error;
				report.cleanupComplete = false;
			})
			.finally(() => {
				report.finishedAt = Date.now();
				last = report;
				if (active === execution) active = undefined;
			});
	};
	return {
		handleRequest(request, response) {
			let url: URL;
			try {
				url = new URL(request.url ?? "/", "http://127.0.0.1");
			} catch {
				response.statusCode = 400;
				respond(response, { error: "Invalid request target." });
				return true;
			}
			if (!url.pathname.startsWith("/api/e2e")) return false;
			if (request.method === "GET" && url.pathname === "/api/e2e")
				respond(response, snapshot());
			else if (request.method === "POST" && url.pathname === "/api/e2e/start") {
				if (closed) response.statusCode = 503;
				else start();
				respond(response, snapshot());
			} else if (
				request.method === "POST" &&
				url.pathname === "/api/e2e/stop"
			) {
				stop();
				respond(response, snapshot());
			} else {
				response.statusCode = 404;
				respond(response, { error: "Not found" });
			}
			return true;
		},
		async shutdown() {
			closed = true;
			stop();
			await active?.done;
		},
	};
}

type Execution = {
	readonly report: LabE2eRun;
	readonly controller: AbortController;
	done: Promise<void>;
};

async function execute(
	execution: Execution,
	cases: readonly LabE2eCase[],
	caseTimeoutMs: number,
): Promise<void> {
	for (const [index, definition] of cases.entries()) {
		if (execution.controller.signal.aborted) break;
		const item = execution.report.tests[index];
		if (!item) throw new Error(`Missing report slot for ${definition.id}.`);
		item.status = LabE2eTestStatusEnum.running;
		const startedAt = Date.now();
		const controller = new AbortController();
		let rejectUnresponsive!: (error: Error) => void;
		let hardTimeout: ReturnType<typeof setTimeout> | undefined;
		let unresponsive = false;
		const unresponsiveCase = new Promise<never>((_resolve, reject) => {
			rejectUnresponsive = reject;
		});
		const requireSettlement = () => {
			if (hardTimeout) return;
			hardTimeout = setTimeout(() => {
				unresponsive = true;
				rejectUnresponsive(
					new Error("Case did not settle within 1 second after interruption."),
				);
			}, 1_000);
		};
		const interrupt = () => {
			controller.abort(execution.controller.signal.reason);
			requireSettlement();
		};
		execution.controller.signal.addEventListener("abort", interrupt, {
			once: true,
		});
		let timedOut = false;
		let cleanupError: unknown;
		let associationError: Error | undefined;
		let infrastructureError: Error | undefined;
		let acceptingCaseUpdates = true;
		const ownedCleanups = new Set<() => void | Promise<void>>();
		const cleanup = async (operation: () => void | Promise<void>) => {
			try {
				await operation();
			} catch (error) {
				cleanupError ??= error;
				throw error;
			}
		};
		const cleanupOwned = async () => {
			const operations = [...ownedCleanups];
			ownedCleanups.clear();
			if (operations.length === 0) return;
			const settled = Promise.allSettled(
				operations.map((operation) => cleanup(operation)),
			);
			let deadline: ReturnType<typeof setTimeout> | undefined;
			const completed = await Promise.race([
				settled.then(() => true),
				new Promise<false>((resolve) => {
					deadline = setTimeout(() => resolve(false), 1_000);
				}),
			]);
			clearTimeout(deadline);
			if (!completed)
				cleanupError ??= new Error(
					"Registered case cleanup did not settle within 1 second.",
				);
		};
		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort(new DOMException("E2E case timed out.", "TimeoutError"));
			requireSettlement();
		}, caseTimeoutMs);
		try {
			const caseTask = definition.run({
				signal: controller.signal,
				trace: (label) =>
					`e2e:${execution.report.id}:${definition.id}:${label}`,
				step(value) {
					if (!acceptingCaseUpdates) return;
					item.step = value;
					appendLog(execution.report, `${definition.id} · ${value}`);
				},
				capture(...recordings) {
					if (!acceptingCaseUpdates) return;
					item.recordings.push(
						...recordings.map((recording) => ({
							...recording,
							runId: execution.report.id,
							caseId: definition.id,
							package: definition.package,
							source: definition.source,
						})),
					);
				},
				cleanup,
				own(operation) {
					if (!acceptingCaseUpdates) {
						void cleanup(operation).catch((error: unknown) => {
							execution.report.errors.push(
								`${definition.id} late cleanup: ${formatError(error)}`,
							);
							execution.report.status = LabE2eStatusEnum.error;
							execution.report.cleanupComplete = false;
						});
						return () => undefined;
					}
					ownedCleanups.add(operation);
					return () => ownedCleanups.delete(operation);
				},
				failInfrastructure(error) {
					infrastructureError = new Error(
						`Case infrastructure failed: ${formatError(error)}`,
					);
					throw infrastructureError;
				},
			});
			await Promise.race([caseTask, unresponsiveCase]);
			clearTimeout(hardTimeout);
			hardTimeout = undefined;
			if (controller.signal.aborted) throw controller.signal.reason;
			item.status = LabE2eTestStatusEnum.passed;
		} catch (error) {
			if (timedOut) item.status = LabE2eTestStatusEnum.timedOut;
			else if (execution.controller.signal.aborted)
				item.status = LabE2eTestStatusEnum.interrupted;
			else item.status = LabE2eTestStatusEnum.failed;
			item.errors.push(formatError(error));
		} finally {
			acceptingCaseUpdates = false;
			clearTimeout(timeout);
			clearTimeout(hardTimeout);
			execution.controller.signal.removeEventListener("abort", interrupt);
			await cleanupOwned();
			item.durationMs = Date.now() - startedAt;
		}
		if (item.status === LabE2eTestStatusEnum.passed)
			associationError = findRecordingAssociationError(item);
		if (unresponsive) {
			if (cleanupError !== undefined)
				execution.report.errors.push(
					`${definition.id} cleanup: ${formatError(cleanupError)}`,
				);
			execution.report.errors.push(
				`${definition.id}: interruption did not reach resource cleanup.`,
			);
			execution.report.status = LabE2eStatusEnum.error;
			execution.report.cleanupComplete = false;
			return;
		}
		if (cleanupError !== undefined) {
			if (infrastructureError)
				execution.report.errors.push(
					`${definition.id} infrastructure: ${infrastructureError.message}`,
				);
			execution.report.errors.push(
				`${definition.id} cleanup: ${formatError(cleanupError)}`,
			);
			execution.report.status = LabE2eStatusEnum.error;
			execution.report.cleanupComplete = false;
			return;
		}
		if (infrastructureError) {
			execution.report.errors.push(
				`${definition.id} infrastructure: ${infrastructureError.message}`,
			);
			execution.report.status = LabE2eStatusEnum.error;
			execution.report.cleanupComplete = true;
			return;
		}
		if (associationError) {
			execution.report.errors.push(
				`${definition.id} recording: ${associationError.message}`,
			);
			execution.report.status = LabE2eStatusEnum.error;
			execution.report.cleanupComplete = true;
			return;
		}
	}
	if (execution.controller.signal.aborted)
		execution.report.status = LabE2eStatusEnum.stopped;
	else if (
		execution.report.tests.some((item) =>
			[LabE2eTestStatusEnum.failed, LabE2eTestStatusEnum.timedOut].includes(
				item.status,
			),
		)
	)
		execution.report.status = LabE2eStatusEnum.failed;
	else if (
		execution.report.tests.length > 0 &&
		execution.report.tests.every(
			(item) => item.status === LabE2eTestStatusEnum.passed,
		)
	)
		execution.report.status = LabE2eStatusEnum.passed;
	else execution.report.status = LabE2eStatusEnum.incomplete;
	execution.report.cleanupComplete = true;
}

function findRecordingAssociationError(item: LabE2eTest): Error | undefined {
	for (const side of Object.values(LabSideEnum)) {
		const recordings = item.recordings.filter(
			(recording) => recording.side === side,
		);
		const entries = recordings.flatMap(
			(recording) => recording.snapshot.entries,
		);
		if (
			recordings.length === 0 ||
			!recordings.some((recording) => recording.snapshot.calls.length > 0) ||
			!entries.some((entry) => entry.source === LabSourceEnum.application) ||
			!entries.some((entry) => entry.source === LabSourceEnum.rpc) ||
			!entries.some((entry) => entry.transportMessage !== undefined)
		)
			return new Error(
				`Observable case did not retain complete ${side} APP, RPC, Protocol, Transport, and call records.`,
			);
	}
}

function resolveCases(
	options: CreateLabE2eRunnerOptions,
): readonly LabE2eCase[] {
	if (options.cases) return options.cases;
	if (!options.endpoint || !options.nodeRecorder)
		throw new TypeError(
			"Default Lab E2E cases require endpoint and nodeRecorder.",
		);
	return createLabE2eCases({
		endpoint: options.endpoint,
		nodeRecorder: options.nodeRecorder,
	});
}

function appendLog(report: LabE2eRun, value: string): void {
	report.logs.push(value.slice(0, 2_000));
	if (report.logs.length > 100) report.logs.splice(0, report.logs.length - 100);
}

function formatError(error: unknown): string {
	return error instanceof Error
		? `${error.name}: ${error.message}`
		: String(error);
}

function respond(response: ServerResponse, value: unknown): void {
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	response.setHeader("Cache-Control", "no-store");
	response.end(JSON.stringify(value));
}
