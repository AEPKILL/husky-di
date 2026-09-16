/**
 * @overview Validates HTTP page ownership, durable restart, batch scheduling and CLI exit verdicts.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { createPlatformService } from "@/factories/platform-service.factory";
import type { PlatformRun } from "@/types/platform-run.type";

it("EXAMPLE-LAB-PLATFORM-OWNERSHIP-001 shares a run across page leases, retains short disconnects, and cleans abandoned debug", async () => {
	await fixture(async ({ root, request, projectPath }) => {
		await writeFile(
			join(root, "debug.case.ts"),
			'export const labCase={title:"shared debug",async run(c){await c.step("boundary",()=>c.assert(true,"yes"))}}',
		);
		for (const pageId of ["first", "second"])
			await request(`${projectPath}/observers`, { pageId, connected: true });
		const [first, duplicate] = await Promise.all([
			request<PlatformRun>(`${projectPath}/runs`, {
				entry: "debug.case.ts",
				mode: "debug",
			}),
			request<PlatformRun>(`${projectPath}/runs`, {
				entry: "debug.case.ts",
				mode: "debug",
			}),
		]);
		assert.equal(first.id, duplicate.id);
		const path = `${projectPath}/runs/${first.id}`;
		await waitFor(
			() => request<PlatformRun>(path),
			(run) => run.state === "paused",
		);
		await request(`${projectPath}/observers`, {
			pageId: "first",
			connected: false,
		});
		await request(`${projectPath}/observers`, {
			pageId: "second",
			connected: false,
		});
		await new Promise((resolve) => setTimeout(resolve, 150));
		await request(`${projectPath}/observers`, {
			pageId: "reopened",
			connected: true,
		});
		assert.equal((await request<PlatformRun>(path)).state, "paused");
		await request(`${projectPath}/observers`, {
			pageId: "reopened",
			connected: false,
		});
		const stopped = await waitFor(
			() => request<PlatformRun>(path),
			(run) => !run.active,
		);
		assert.equal(stopped.cleanup, "complete");
		assert.notEqual(stopped.result, "passed");
	});
});

it("EXAMPLE-LAB-PLATFORM-OWNERSHIP-001 completes automatic tests without observers and reconnects without restarting", async () => {
	await fixture(async ({ root, request, projectPath }) => {
		await writeFile(
			join(root, "automatic.case.ts"),
			'export const labCase={title:"background",async run(c){await new Promise(r=>setTimeout(r,900));c.assert(true,"background completes")}}',
		);
		const started = await request<PlatformRun>(`${projectPath}/runs`, {
			entry: "automatic.case.ts",
		});
		await request(`${projectPath}/observers`, {
			pageId: "closed",
			connected: false,
		});
		const complete = await waitFor(
			() => request<PlatformRun>(`${projectPath}/runs/${started.id}`),
			(run) => !run.active,
		);
		assert.equal(complete.result, "passed");
		await request(`${projectPath}/observers`, {
			pageId: "reopened",
			connected: true,
		});
		const list = await request<{ history: PlatformRun[] }>(
			`${projectPath}/runs`,
		);
		assert.equal(list.history[0].id, started.id);
		assert.equal(list.history.length, 1);
	});
});

it("EXAMPLE-LAB-PLATFORM-RESULT-001 continues ordinary failures but stops scheduling after cleanup faults", async () => {
	await fixture(async ({ root, request, projectPath }) => {
		await writeFile(
			join(root, "first.case.ts"),
			'export const labCase={title:"ordinary",run:c=>c.assert(false,"failed first")};',
		);
		await writeFile(
			join(root, "second.case.ts"),
			'export const labCase={title:"later",run:c=>c.assert(true,"later ran")};',
		);
		let run = await request<PlatformRun>(`${projectPath}/runs`, {
			entries: ["first.case.ts", "second.case.ts"],
		});
		run = await waitFor(
			() => request<PlatformRun>(`${projectPath}/runs/${run.id}`),
			(current) => !current.active,
		);
		assert.equal(run.result, "failed");
		assert.ok(
			run.events.some(
				(event) => event.entry === "second.case.ts" && event.passed,
			),
		);
		await writeFile(
			join(root, "first.case.ts"),
			'export const labCase={title:"broken cleanup",run(c){c.own(()=>{throw new Error("cleanup fault")});c.assert(true,"first")}};',
		);
		run = await request<PlatformRun>(`${projectPath}/runs`, {
			entries: ["first.case.ts", "second.case.ts"],
		});
		run = await waitFor(
			() => request<PlatformRun>(`${projectPath}/runs/${run.id}`),
			(current) => !current.active,
		);
		assert.equal(run.result, "error");
		assert.equal(run.cleanup, "failed");
		assert.ok(!run.events.some((event) => event.entry === "second.case.ts"));
	});
});

it("EXAMPLE-LAB-PLATFORM-HISTORY-001 reloads immutable run evidence after service restart", async () => {
	const root = await mkdtemp(join(tmpdir(), "lab-history-integration-"));
	let service = createPlatformService();
	try {
		await writeFile(
			join(root, "history.case.ts"),
			'export const labCase={title:"history",run:c=>{c.log("durable evidence");c.assert(true,"actual assertion")}}',
		);
		const project = await service.openProject(root);
		const started = await service.start(project.id, {
			entry: "history.case.ts",
		});
		const complete = await waitFor(
			() => service.readRun(project.id, started.id),
			(run) => !run.active,
		);
		await service.shutdown();
		service = createPlatformService();
		await service.openProject(root);
		assert.deepEqual(await service.readRun(project.id, started.id), complete);
	} finally {
		await service.shutdown();
		await rm(root, { recursive: true, force: true });
	}
});

it("EXAMPLE-LAB-PLATFORM-CLI-001 uses identical saved cases and never gives unverified batches a successful exit", async () => {
	const root = await mkdtemp(join(tmpdir(), "lab-cli-test-"));
	try {
		await writeFile(
			join(root, "cli.case.ts"),
			'export const labCase={title:"CLI",run:c=>c.assert(c.parameters.input===42,"same parameters")};',
		);
		const passed = await cli([
			"--project",
			root,
			"--parameters",
			'{"input":42}',
			"--json",
		]);
		assert.equal(passed.code, 0, passed.stderr);
		assert.equal(JSON.parse(passed.stdout).result, "passed");
		await writeFile(
			join(root, "cli.case.ts"),
			'export const labCase={title:"draft",run:c=>c.log("no assertion")};',
		);
		const draft = await cli(["--project", root, "--json"]);
		assert.equal(draft.code, 1, draft.stderr);
		assert.equal(JSON.parse(draft.stdout).result, "unverified");
		const unavailable = await cli([
			"--project",
			root,
			"--case",
			"missing.case.ts",
		]);
		assert.equal(unavailable.code, 2);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

async function fixture(
	operation: (context: {
		root: string;
		projectPath: string;
		request: <T = unknown>(path: string, body?: unknown) => Promise<T>;
	}) => Promise<void>,
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "lab-control-test-"));
	const service = createPlatformService({
		builtinRoot: root,
		debugRetentionMs: 400,
		heartbeatLeaseMs: 5_000,
		stopGraceMs: 500,
	});
	const server = createServer((request, response) =>
		service.handleRequest(request, response),
	);
	try {
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const request = async <T>(path: string, body?: unknown): Promise<T> => {
			const response = await fetch(
				`http://127.0.0.1:${address.port}/api/platform${path}`,
				{
					...(body
						? {
								method: "POST",
								headers: { "content-type": "application/json" },
								body: JSON.stringify(body),
							}
						: {}),
				},
			);
			const result = await response.json();
			assert.ok(response.ok, JSON.stringify(result));
			return result;
		};
		const opened = await request<{ id: string }>("/projects", {
			rootPath: root,
		});
		await operation({ root, request, projectPath: `/projects/${opened.id}` });
	} finally {
		await service.shutdown();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(root, { recursive: true, force: true });
	}
}

async function waitFor<T>(
	read: () => Promise<T>,
	predicate: (value: T) => boolean,
): Promise<T> {
	const deadline = Date.now() + 20_000;
	while (true) {
		const value = await read();
		if (predicate(value)) return value;
		if (Date.now() > deadline)
			throw new Error(`Timed out: ${JSON.stringify(value)}`);
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

async function cli(
	args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	const child = spawn(
		process.execPath,
		["--import", "tsx", "src/server/cli.ts", ...args],
		{
			cwd: fileURLToPath(new URL("../../", import.meta.url)),
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk: Buffer) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk: Buffer) => {
		stderr += chunk;
	});
	return new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("exit", (code) => resolve({ code, stdout, stderr }));
	});
}
