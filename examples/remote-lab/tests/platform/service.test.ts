/**
 * @overview Exercises real process supervision, shared project admission, pause clocks, snapshots and honest outcomes.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	LabExecutionCommandEnum,
	LabExecutionEventEnum,
	LabExecutionModeEnum,
} from "@/enums/platform/execution.enum";
import {
	PlatformCleanupEnum,
	PlatformRunResultEnum,
	PlatformRunStateEnum,
	PlatformTerminationEnum,
} from "@/enums/platform-run.enum";
import { createPlatformService } from "@/factories/platform-service.factory";
import type { IPlatformService } from "@/interfaces/platform-service.interface";
import type { PlatformRun } from "@/types/platform-run.type";

describe("Remote Lab project service", () => {
	it("EXAMPLE-LAB-PLATFORM-DEBUG-001 checks short active budgets before accepting a terminal verdict", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(
				join(root, "short.case.ts"),
				'export const labCase={title:"short timeout",timeoutMs:1,run(c){const end=Date.now()+40;while(Date.now()<end){}c.assert(true,"too late")}};',
			);
			const run = await service.start(projectId, { entry: "short.case.ts" });
			const finished = await until(
				service,
				projectId,
				run.id,
				(current) => !current.active,
			);
			assert.equal(finished.result, PlatformRunResultEnum.failed);
			assert.match(finished.error ?? "", /timeout exceeded/);
		});
	});

	it("EXAMPLE-LAB-PLATFORM-ISOLATION-001 classifies unexpected worker exit without inventing cleanup", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(
				join(root, "exit.case.ts"),
				'export const labCase={title:"exit",run(c){c.assert(true,"before exit");process.exit(0)}};',
			);
			const run = await service.start(projectId, { entry: "exit.case.ts" });
			const finished = await until(
				service,
				projectId,
				run.id,
				(current) => !current.active,
			);
			assert.equal(finished.result, PlatformRunResultEnum.error);
			assert.equal(finished.termination, PlatformTerminationEnum.unexpected);
			assert.equal(finished.cleanup, PlatformCleanupEnum.unknown);
		});
	});

	it("EXAMPLE-LAB-PLATFORM-HISTORY-001 marks truncated process output explicitly", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(
				join(root, "log.case.ts"),
				'export const labCase={title:"large output",run(c){console.log("x".repeat(10000));c.assert(true,"verified")}};',
			);
			const run = await service.start(projectId, { entry: "log.case.ts" });
			const finished = await until(
				service,
				projectId,
				run.id,
				(current) => !current.active,
			);
			assert.equal(finished.result, PlatformRunResultEnum.passed);
			assert.equal(finished.recordingTruncated, true);
			assert.ok(
				finished.events.some(
					(event) => event.name === "stdout" && event.truncated,
				),
			);
			assert.ok(
				finished.events
					.filter((event) => event.name === "stdout")
					.every((event) => !event.message?.includes("�")),
			);
		});
	});

	it("EXAMPLE-LAB-PLATFORM-DEBUG-001 retains responsive timeout failures and force-stops an unresponsive debugger", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(
				join(root, "alive.ts"),
				'export function labNode(c){const timer=setInterval(()=>c.log("still alive"),25);c.own(()=>clearInterval(timer));}',
			);
			await writeFile(
				join(root, "timeout.case.ts"),
				'export const labCase={title:"inspect timeout",timeoutMs:1500,async run(c){await c.environment.node("alive.ts");await c.step("never settles",()=>new Promise(()=>{}))}};',
			);
			const run = await service.start(projectId, {
				entry: "timeout.case.ts",
				mode: LabExecutionModeEnum.debug,
			});
			await until(
				service,
				projectId,
				run.id,
				(current) => current.state === PlatformRunStateEnum.paused,
			);
			await service.control(
				projectId,
				run.id,
				LabExecutionCommandEnum.continue,
			);
			const retained = await until(
				service,
				projectId,
				run.id,
				(current) => current.state === PlatformRunStateEnum.retained,
			);
			assert.equal(retained.result, PlatformRunResultEnum.failed);
			assert.equal(retained.cleanup, PlatformCleanupEnum.pending);
			const before = retained.events.length;
			await new Promise((resolve) => setTimeout(resolve, 150));
			assert.ok(
				(await service.readRun(projectId, run.id)).events.length > before,
				"the retained Node environment remains alive after the case timeout",
			);
			await service.control(projectId, run.id, LabExecutionCommandEnum.stop);
			assert.equal(
				(await until(service, projectId, run.id, (current) => !current.active))
					.cleanup,
				PlatformCleanupEnum.complete,
			);
			await writeFile(
				join(root, "loop-timeout.case.ts"),
				'export const labCase={title:"debug CPU loop",timeoutMs:50,run(c){c.log("loop");while(true){}}};',
			);
			const started = Date.now();
			const loop = await service.start(projectId, {
				entry: "loop-timeout.case.ts",
				mode: LabExecutionModeEnum.debug,
			});
			const stopped = await until(
				service,
				projectId,
				loop.id,
				(current) => !current.active,
			);
			assert.ok(Date.now() - started < 5000);
			assert.equal(stopped.result, PlatformRunResultEnum.failed);
			assert.equal(stopped.termination, PlatformTerminationEnum.forced);
			assert.equal(stopped.cleanup, PlatformCleanupEnum.complete);
		});
	});

	it("EXAMPLE-LAB-PLATFORM-HISTORY-001 never starts user code when initial evidence cannot persist", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(
				join(root, "evidence.case.ts"),
				'export const labCase={title:"must not execute",run:c=>c.assert(true,"should not run")};',
			);
			const history = join(root, ".remote-lab/history");
			await rm(history, { recursive: true, force: true });
			await writeFile(history, "not a directory");
			const run = await service.start(projectId, { entry: "evidence.case.ts" });
			assert.equal(run.result, PlatformRunResultEnum.error);
			assert.equal(run.active, false);
			assert.deepEqual(run.events, []);
			assert.match(run.error ?? "", /History persistence failed/);
		});
	});

	it("EXAMPLE-LAB-PLATFORM-ISOLATION-001 bounds cleanup that never settles and cannot turn its assertion into success", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(
				join(root, "cleanup-hang.case.ts"),
				'export const labCase={title:"uncooperative cleanup",run(c){c.own(()=>new Promise(()=>{}));c.assert(true,"before cleanup")}};',
			);
			const run = await service.start(projectId, {
				entry: "cleanup-hang.case.ts",
			});
			await until(service, projectId, run.id, (current) =>
				current.events.some(
					(event) => event.type === LabExecutionEventEnum.caseResult,
				),
			);
			await service.control(projectId, run.id, LabExecutionCommandEnum.stop);
			const stopped = await until(
				service,
				projectId,
				run.id,
				(current) => !current.active,
			);
			assert.equal(stopped.termination, PlatformTerminationEnum.forced);
			assert.equal(stopped.cleanup, PlatformCleanupEnum.complete);
			assert.notEqual(stopped.result, PlatformRunResultEnum.passed);
		});
	});

	it("EXAMPLE-LAB-PLATFORM-RESULT-001 distinguishes assertions, drafts and cleanup failures", async () => {
		await fixture(async ({ root, service, projectId }) => {
			for (const [name, body, expected] of [
				[
					"verified",
					'c.assert(1 + 1 === 2, "real assertion")',
					PlatformRunResultEnum.passed,
				],
				[
					"draft",
					'c.log("execution is not verification")',
					PlatformRunResultEnum.unverified,
				],
				[
					"failed",
					'c.assert(false, "deliberate failure")',
					PlatformRunResultEnum.failed,
				],
				[
					"cleanup",
					'c.own(() => { throw new Error("cleanup failed") }); c.assert(true, "valid")',
					PlatformRunResultEnum.error,
				],
			] as const) {
				await writeFile(
					join(root, `${name}.case.ts`),
					`export const labCase = { title: "${name}", async run(c) { ${body} } };`,
				);
				const started = await service.start(projectId, {
					entry: `${name}.case.ts`,
				});
				const finished = await until(
					service,
					projectId,
					started.id,
					(run) => !run.active,
				);
				assert.equal(
					finished.result,
					expected,
					JSON.stringify(finished, null, 2),
				);
				assert.equal(finished.termination, PlatformTerminationEnum.normal);
				assert.equal(
					finished.cleanup,
					name === "cleanup"
						? PlatformCleanupEnum.failed
						: PlatformCleanupEnum.complete,
				);
			}
		});
	});

	it("EXAMPLE-LAB-PLATFORM-SNAPSHOT-001 imports fixed saved helpers and reruns current source", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(join(root, "helper.ts"), "export const value = 1;");
			await writeFile(
				join(root, "snapshot.case.ts"),
				'import { value } from "./helper.ts"; export const labCase = { title: "snapshot", run: async c => c.step("inspect snapshot", () => c.assert(value === c.parameters.expected, "fixed helper", value, c.parameters.expected)) };',
			);
			const first = await service.start(projectId, {
				entry: "snapshot.case.ts",
				mode: LabExecutionModeEnum.debug,
				parameters: { expected: 1 },
			});
			await until(
				service,
				projectId,
				first.id,
				(run) => run.state === PlatformRunStateEnum.paused,
			);
			await writeFile(join(root, "helper.ts"), "export const value = 2;");
			const duplicate = await service.start(projectId, {
				entry: "snapshot.case.ts",
			});
			assert.equal(duplicate.id, first.id);
			await service.control(
				projectId,
				first.id,
				LabExecutionCommandEnum.continue,
			);
			const finished = await until(
				service,
				projectId,
				first.id,
				(run) => !run.active,
			);
			assert.equal(finished.result, PlatformRunResultEnum.passed);
			assert.equal(
				finished.snapshot.files["helper.ts"],
				"export const value = 1;",
			);
			const next = await service.start(projectId, {
				entry: "snapshot.case.ts",
				parameters: { expected: 2 },
			});
			assert.notEqual(next.id, first.id);
			assert.equal(
				(await until(service, projectId, next.id, (run) => !run.active)).result,
				PlatformRunResultEnum.passed,
			);
			assert.equal(
				(await service.readRun(projectId, first.id)).snapshot.files[
					"helper.ts"
				],
				"export const value = 1;",
			);
		});
	});

	it("EXAMPLE-LAB-PLATFORM-DEBUG-001 excludes manual pauses and retains failed debug evidence until Stop", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(
				join(root, "pause.case.ts"),
				'export const labCase = { title:"pause clock", timeoutMs:300, async run(c) { const before=Date.now(); await c.step("real clock", () => c.assert(Date.now()-before >= 450,"wall time continues")); await c.step("failure",()=>c.assert(false,"inspect failure")); } };',
			);
			const run = await service.start(projectId, {
				entry: "pause.case.ts",
				mode: LabExecutionModeEnum.debug,
			});
			await until(
				service,
				projectId,
				run.id,
				(current) => current.state === PlatformRunStateEnum.paused,
			);
			await new Promise((resolve) => setTimeout(resolve, 500));
			assert.equal(
				(await service.readRun(projectId, run.id)).state,
				PlatformRunStateEnum.paused,
			);
			await service.control(
				projectId,
				run.id,
				LabExecutionCommandEnum.continue,
			);
			const failed = await until(
				service,
				projectId,
				run.id,
				(current) => current.state === PlatformRunStateEnum.retained,
			);
			assert.equal(failed.result, PlatformRunResultEnum.failed);
			assert.equal(failed.cleanup, PlatformCleanupEnum.pending);
			await assert.rejects(
				service.control(projectId, run.id, LabExecutionCommandEnum.continue),
				/failed steps/,
			);
			await service.control(projectId, run.id, LabExecutionCommandEnum.stop);
			assert.equal(
				(await until(service, projectId, run.id, (current) => !current.active))
					.cleanup,
				PlatformCleanupEnum.complete,
			);
		});
	});

	it("EXAMPLE-LAB-PLATFORM-ISOLATION-001 kills infinite execution while project editing and history remain available", async () => {
		await fixture(async ({ root, service, projectId }) => {
			await writeFile(
				join(root, "loop.case.ts"),
				'export const labCase = { title:"loop", timeoutMs:60000, run(c) { c.log("entered loop"); while(true) {} } };',
			);
			const run = await service.start(projectId, { entry: "loop.case.ts" });
			await until(service, projectId, run.id, (current) =>
				current.events.some(
					(event) =>
						event.type === LabExecutionEventEnum.record &&
						event.message === "entered loop",
				),
			);
			await writeFile(join(root, "helper.ts"), "export const editable = true;");
			assert.match(await readFile(join(root, "helper.ts"), "utf8"), /true/);
			const started = Date.now();
			await service.control(projectId, run.id, LabExecutionCommandEnum.stop);
			const finished = await until(
				service,
				projectId,
				run.id,
				(current) => !current.active,
			);
			assert.ok(Date.now() - started < 5_000);
			assert.equal(finished.termination, PlatformTerminationEnum.forced);
			assert.equal(finished.cleanup, PlatformCleanupEnum.complete);
			assert.notEqual(finished.result, PlatformRunResultEnum.passed);
			assert.ok(
				finished.events.some((event) => event.message === "entered loop"),
			);
		});
	});
});

async function fixture(
	operation: (context: {
		root: string;
		service: IPlatformService;
		projectId: string;
	}) => Promise<void>,
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "lab-service-test-"));
	const service = createPlatformService({
		stopGraceMs: 500,
		debugRetentionMs: 20_000,
	});
	try {
		const project = await service.openProject(root);
		await operation({ root, service, projectId: project.id });
	} finally {
		await service.shutdown();
		await rm(root, { recursive: true, force: true });
	}
}

async function until(
	service: IPlatformService,
	projectId: string,
	runId: string,
	predicate: (run: PlatformRun) => boolean,
): Promise<PlatformRun> {
	const deadline = Date.now() + 20_000;
	while (true) {
		const run = await service.readRun(projectId, runId);
		if (predicate(run)) return run;
		if (Date.now() > deadline)
			throw new Error(
				`Run did not reach expected state: ${JSON.stringify(run)}`,
			);
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}
