/**
 * @overview Verifies immutable module execution, real Chromium Remote peers, and live timers across debug steps.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { IRpcConnection } from "@husky-di/remote";
import { chromium } from "@playwright/test";
import { firstValueFrom, of, Subject } from "rxjs";
import {
	LabCaseOutcomeEnum,
	LabExecutionCommandEnum,
	LabExecutionEventEnum,
	LabExecutionModeEnum,
	LabExecutionStateEnum,
} from "../../src/enums/platform/execution.enum";
import { createLabNodeContext } from "../../src/factories/platform/lab-node-context.factory";
import type { LabExecutionEvent } from "../../src/types/platform/execution.type";

test("transport records detach exact submitted bytes, preserve rejected sends, and distinguish Connections and Peers", async () => {
	const records: Record<string, unknown>[] = [];
	const lifetime = createLabNodeContext({
		parameters: {},
		nodeId: "fixture-node",
		emit: (record) => records.push(record as Record<string, unknown>),
	});
	let admission = Promise.withResolvers<void>();
	const incoming = new Subject<Uint8Array>();
	const connection: IRpcConnection = {
		message$: incoming,
		send(bytes) {
			bytes.fill(0);
			return admission.promise;
		},
		async close() {},
	};
	const adapter = () => ({ connection$: of(connection), async connect() {} });
	const first = await firstValueFrom(
		lifetime.context.transport(adapter()).connection$,
	);
	const same = await firstValueFrom(
		lifetime.context.transport(adapter()).connection$,
	);
	assert.equal(
		first,
		same,
		"The same physical Connection retains its observed identity across adapter wrappers.",
	);
	const raw = '{ "kind": "call", "value": "real" }';
	const input = new TextEncoder().encode(raw);
	const pending = first.send(input);
	assert.equal(
		records.length,
		0,
		"Pending admission is not recorded as successful.",
	);
	admission.resolve();
	await pending;
	assert.equal(records[0]?.payload, raw);
	assert.equal(records[0]?.bytes, new TextEncoder().encode(raw).byteLength);
	assert.equal(records[0]?.outcome, "locally-admitted");
	admission = Promise.withResolvers<void>();
	const failure = new Error("original send rejection");
	const rejected = first.send(new TextEncoder().encode(raw));
	admission.reject(failure);
	await assert.rejects(rejected, (error) => error === failure);
	assert.equal(records[1]?.outcome, "failed");
	assert.equal(records[1]?.payload, raw);
	const reception = first.message$.subscribe();
	const received = new TextEncoder().encode(raw);
	incoming.next(received);
	received.fill(0);
	assert.equal(records[2]?.direction, "received");
	assert.equal(records[2]?.payload, raw);
	const replacementConnection: IRpcConnection = {
		...connection,
		async send() {},
	};
	const replacement = await firstValueFrom(
		lifetime.context.transport({
			connection$: of(replacementConnection),
			async connect() {},
		}).connection$,
	);
	await replacement.send(new TextEncoder().encode(raw));
	assert.notEqual(
		records[0]?.connectionId,
		records[3]?.connectionId,
		"A replacement physical Connection must receive a new ID.",
	);
	assert.equal(records[0]?.connectionId, records[1]?.connectionId);
	const events = new Subject<unknown>();
	const owner = { state: { status: "active" }, event$: events };
	const peer1 = {
		state: { status: "connected", error: new TypeError("private detail") },
	};
	const peer2 = { state: { status: "connected" } };
	lifetime.context.observe(owner, "same owner label");
	events.next({ type: "peer-opened", peer: peer1 });
	events.next({ type: "peer-recovered", peer: peer1 });
	events.next({ type: "peer-opened", peer: peer2 });
	peer1.state.status = "closed";
	peer1.state.error.message = "changed later";
	const observations = records.filter((record) => record.kind === "rpc");
	assert.equal(observations[0]?.peerId, observations[1]?.peerId);
	assert.notEqual(observations[0]?.peerId, observations[2]?.peerId);
	assert.deepEqual(observations[0]?.peerState, {
		status: "connected",
		error: "TypeError",
	});
	assert.equal(
		observations.every(
			(record) =>
				record.nodeId === "fixture-node" &&
				typeof record.observerId === "string" &&
				typeof record.ownerId === "string",
		),
		true,
	);
	assert.equal(JSON.stringify(observations).includes("private detail"), false);
	reception.unsubscribe();
	await lifetime.close();
});

test("execution loads the project tsconfig and imported snapshot and reports unverified drafts", async (t) => {
	const fixture = await createFixture(t, {
		"tsconfig.json": JSON.stringify({
			compilerOptions: { baseUrl: ".", paths: { "@project/*": ["lib/*"] } },
		}),
		"lib/value.ts": "export const value = 42;",
		"case.ts":
			"import {value} from '@project/value'; export const labCase={title:'saved aliases',async run(ctx){await ctx.step('read saved helper',()=>ctx.assert(value===42,'alias resolves snapshot',value,42));}};",
		"draft.ts": "export const labCase={title:'draft',run(){}};",
	});
	const run = await execute(t, fixture, ["case.ts", "draft.ts"]);
	await run.exited;
	assert.deepEqual(
		run.events
			.filter((event) => event.type === LabExecutionEventEnum.caseResult)
			.map((event) => event.outcome),
		[LabCaseOutcomeEnum.passed, LabCaseOutcomeEnum.unverified],
	);
	const assertion = run.events.find(
		(event) => event.type === LabExecutionEventEnum.assertion,
	);
	assert.equal(assertion?.actual, 42);
	assert.equal(assertion?.source?.file, "case.ts", JSON.stringify(run.events));
});

test("caught failed assertions stay failed and oversized values retain the actual verdict", async (t) => {
	const fixture = await createFixture(t, {
		"case.ts":
			"export const labCase={title:'caught assertion',run(ctx){try{ctx.assert(false,'cannot be swallowed','x'.repeat(300000),true);}catch{} }};",
	});
	const run = await execute(t, fixture, ["case.ts"]);
	await run.exited;
	const assertion = run.events.find(
		(event) => event.type === LabExecutionEventEnum.assertion,
	);
	assert.equal(assertion?.passed, false);
	assert.equal((assertion?.actual as { truncated: boolean }).truncated, true);
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.caseResult)
			?.outcome,
		LabCaseOutcomeEnum.failed,
	);
});

test("returning before an unawaited asynchronous step finishes cannot produce a passed case", async (t) => {
	const fixture = await createFixture(t, {
		"case.ts":
			"export const labCase={title:'forgotten step await',run(ctx){ctx.assert(true,'setup succeeded');void ctx.step('still running',async()=>{await new Promise(resolve=>setTimeout(resolve,100));ctx.assert(false,'late validation fails');});}};",
	});
	const run = await execute(t, fixture, ["case.ts"]);
	await run.exited;
	assert.notEqual(
		run.events.find((event) => event.type === LabExecutionEventEnum.caseResult)
			?.outcome,
		LabCaseOutcomeEnum.passed,
		JSON.stringify(run.events),
	);
	const terminal = run.events.findIndex(
		(event) =>
			event.type === LabExecutionEventEnum.step && event.phase === "failed",
	);
	assert.ok(
		terminal >= 0 &&
			terminal <
				run.events.findIndex(
					(event) => event.type === LabExecutionEventEnum.caseResult,
				),
	);
});

test("batch scheduling waits for all declared steps and their owned cleanup", async (t) => {
	const fixture = await createFixture(t, {
		"first.ts":
			"import {writeFile} from 'node:fs/promises';export const labCase={title:'joined step',run(ctx){ctx.own(()=>writeFile(new URL('./cleanup.txt',import.meta.url),'cleaned'));void ctx.step('late success',async()=>{await new Promise(resolve=>setTimeout(resolve,80));ctx.assert(true,'validated after entry returned');});}};",
		"second.ts":
			"import {readFile} from 'node:fs/promises';export const labCase={title:'next case',async run(ctx){ctx.assert(await readFile(new URL('./cleanup.txt',import.meta.url),'utf8')==='cleaned','previous cleanup finished before scheduling');}};",
	});
	const run = await execute(t, fixture, ["first.ts", "second.ts"]);
	await run.exited;
	assert.deepEqual(
		run.events
			.filter((event) => event.type === LabExecutionEventEnum.caseResult)
			.map((event) => event.outcome),
		[LabCaseOutcomeEnum.passed, LabCaseOutcomeEnum.passed],
	);
	const stepTerminal = run.events.findIndex(
		(event) =>
			event.type === LabExecutionEventEnum.step && event.phase === "completed",
	);
	const firstResult = run.events.findIndex(
		(event) => event.type === LabExecutionEventEnum.caseResult,
	);
	const cleanup = run.events.findIndex(
		(event) =>
			event.type === LabExecutionEventEnum.cleanup &&
			event.entry === "first.ts",
	);
	const second = run.events.findIndex((event) => event.entry === "second.ts");
	assert.ok(
		stepTerminal >= 0 &&
			stepTerminal < firstResult &&
			firstResult < cleanup &&
			cleanup < second,
	);
});

test("Stop publishes one interrupted terminal for an unsettled declared step", async (t) => {
	const fixture = await createFixture(t, {
		"case.ts":
			"export const labCase={title:'stopped join',run(ctx){ctx.assert(true,'setup');void ctx.step('pending operation',()=>new Promise(()=>{}));}};",
	});
	const run = await execute(t, fixture, ["case.ts"]);
	await run.until(
		(event) =>
			event.type === LabExecutionEventEnum.step && event.phase === "running",
	);
	run.child.send({ type: LabExecutionCommandEnum.stop });
	await run.exited;
	assert.deepEqual(
		run.events
			.filter((event) => event.type === LabExecutionEventEnum.step)
			.map((event) => event.phase),
		["pending", "running", "interrupted"],
	);
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.caseResult)
			?.outcome,
		LabCaseOutcomeEnum.interrupted,
	);
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.cleanup)
			?.complete,
		true,
	);
});

test("debug timeout fails the test wait while retaining live nodes until Stop", async (t) => {
	const fixture = await createFixture(t, {
		"node.ts":
			"export function labNode(ctx){const timer=setInterval(()=>ctx.log('alive after test timeout'),20);ctx.own(()=>clearInterval(timer));}",
		"case.ts":
			"export const labCase={title:'debug deadline',async run(ctx){await ctx.environment.node('node.ts');await ctx.step('unsettled operation',()=>new Promise(()=>{}));await ctx.step('must not resume',()=>ctx.assert(true,'unreachable'));}};",
	});
	const run = await execute(
		t,
		fixture,
		["case.ts"],
		LabExecutionModeEnum.debug,
	);
	await run.until((event) => event.state === LabExecutionStateEnum.paused);
	run.child.send({ type: LabExecutionCommandEnum.continue });
	await run.until(
		(event) =>
			event.type === LabExecutionEventEnum.step && event.phase === "running",
	);
	run.child.send({ type: LabExecutionCommandEnum.timeout });
	await run.until((event) => event.state === LabExecutionStateEnum.retained);
	const before = run.events.length;
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.ok(
		run.events
			.slice(before)
			.some((event) =>
				(JSON.stringify(event.data) ?? "").includes("alive after test timeout"),
			),
	);
	const result = run.events.find(
		(event) => event.type === LabExecutionEventEnum.caseResult,
	);
	assert.equal(result?.outcome, LabCaseOutcomeEnum.failed);
	assert.equal(result?.infrastructure, false);
	assert.equal(
		run.events.some((event) => event.type === LabExecutionEventEnum.cleanup),
		false,
	);
	run.child.send({ type: LabExecutionCommandEnum.continue });
	run.child.send({ type: LabExecutionCommandEnum.stop });
	await run.exited;
	assert.equal(
		run.events.some((event) => event.name === "must not resume"),
		false,
	);
	assert.deepEqual(
		run.events
			.filter((event) => event.type === LabExecutionEventEnum.step)
			.map((event) => event.phase),
		["pending", "running", "failed"],
	);
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.cleanup)
			?.complete,
		true,
	);
});

test("nested nonliteral dynamic imports retain project aliases and import.meta.url", async (t) => {
	const fixture = await createFixture(t, {
		"tsconfig.json": JSON.stringify({
			compilerOptions: { baseUrl: ".", paths: { "@project/*": ["lib/*"] } },
		}),
		"lib/data.ts": "export const answer=42;",
		"lib/helper.ts":
			"import {answer} from '@project/data'; export async function inspect(){const path='./data.ts';const loaded=await import(path);return {answer:answer+loaded.answer,url:new URL('./data.ts',import.meta.url).pathname};}",
		"case.ts":
			"export const labCase={title:'dynamic saved imports',async run(ctx){const entry='./lib/helper.ts';const helper=await import(entry);const result=await helper.inspect();ctx.assert(result.answer===84,'nested dynamic import uses saved alias',result);ctx.assert(result.url.endsWith('/lib/data.ts')&&!result.url.includes('.lab-compiled'),'import.meta.url retains original source location',result.url);}};",
	});
	const run = await execute(t, fixture, ["case.ts"]);
	await run.exited;
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.caseResult)
			?.outcome,
		LabCaseOutcomeEnum.passed,
		JSON.stringify(run.events),
	);
});

test("Chromium loads nested dynamic project imports and preserves each module URL", {
	timeout: 30000,
}, async (t) => {
	const fixture = await createFixture(t, {
		"tsconfig.json": JSON.stringify({
			compilerOptions: { baseUrl: ".", paths: { "@project/*": ["lib/*"] } },
		}),
		"lib/data.ts": "export const answer=42;",
		"lib/helper.ts":
			"import {answer} from '@project/data'; export async function inspect(){const path='./data.ts';const loaded=await import(path);return {answer:answer+loaded.answer,url:new URL('./data.ts',import.meta.url).pathname};}",
		"browser.ts":
			"export async function labNode(){const entry='./lib/helper.ts';const helper=await import(entry);return helper.inspect();}",
		"case.ts":
			"export const labCase={title:'Chromium project imports',async run(ctx){const browser=await ctx.environment.browser('browser.ts');ctx.assert(browser.result.answer===84,'browser dynamic import uses saved alias',browser.result);ctx.assert(browser.result.url.endsWith('/lib/data.ts'),'browser module URL identifies its actual source',browser.result);}};",
	});
	const browser = await chromium.launchServer({ headless: true });
	t.after(() => browser.close());
	const run = await execute(
		t,
		fixture,
		["case.ts"],
		LabExecutionModeEnum.test,
		browser.wsEndpoint(),
	);
	await run.exited;
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.caseResult)
			?.outcome,
		LabCaseOutcomeEnum.passed,
		JSON.stringify(run.events),
	);
});

test("debug pauses only step execution while real Node timers keep producing evidence", async (t) => {
	const fixture = await createFixture(t, {
		"node.ts":
			"export function labNode(ctx){const timer=setInterval(()=>ctx.log('live timer',Date.now()),20);ctx.own(()=>clearInterval(timer));return {pid:process.pid};}",
		"case.ts":
			"export const labCase={title:'pause',async run(ctx){await ctx.environment.node('node.ts');await ctx.step('assert after inspection',()=>ctx.assert(true,'explicit assertion'));}};",
	});
	const run = await execute(
		t,
		fixture,
		["case.ts"],
		LabExecutionModeEnum.debug,
	);
	await run.until((event) => event.state === LabExecutionStateEnum.paused);
	const before = run.events.length;
	await new Promise((resolve) => setTimeout(resolve, 140));
	assert.ok(
		run.events
			.slice(before)
			.filter((event) =>
				(JSON.stringify(event.data) ?? "").includes("live timer"),
			).length >= 3,
	);
	assert.equal(
		run.events.some((event) => event.type === LabExecutionEventEnum.assertion),
		false,
	);
	run.child.send({ type: LabExecutionCommandEnum.continue });
	await run.exited;
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.caseResult)
			?.outcome,
		LabCaseOutcomeEnum.passed,
	);
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.cleanup)
			?.complete,
		true,
	);
});

test("a failed debug step retains its live Node environment until Stop and cannot continue", async (t) => {
	const fixture = await createFixture(t, {
		"node.ts":
			"export function labNode(ctx){const timer=setInterval(()=>ctx.log('retained node is alive'),20);ctx.own(()=>clearInterval(timer));return process.pid;}",
		"case.ts":
			"export const labCase={title:'retained live failure',async run(ctx){await ctx.environment.node('node.ts');await ctx.step('throw',()=>ctx.assert(false,'inspect the original failure'));await ctx.step('must never run',()=>ctx.assert(true,'unreachable'));}};",
	});
	const run = await execute(
		t,
		fixture,
		["case.ts"],
		LabExecutionModeEnum.debug,
	);
	await run.until((event) => event.state === LabExecutionStateEnum.paused);
	run.child.send({ type: LabExecutionCommandEnum.continue });
	await run.until((event) => event.state === LabExecutionStateEnum.retained);
	const before = run.events.length;
	run.child.send({ type: LabExecutionCommandEnum.continue });
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.ok(
		run.events
			.slice(before)
			.some((event) =>
				(JSON.stringify(event.data) ?? "").includes("retained node is alive"),
			),
	);
	assert.equal(
		run.events.some((event) => event.name === "must never run"),
		false,
	);
	assert.equal(
		run.events.some((event) => event.type === LabExecutionEventEnum.cleanup),
		false,
	);
	run.child.send({ type: LabExecutionCommandEnum.stop });
	await run.exited;
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.caseResult)
			?.outcome,
		LabCaseOutcomeEnum.failed,
	);
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.cleanup)
			?.complete,
		true,
	);
});

test("built-in cases prove real Chromium/Node Remote behavior and Node transport conformance", {
	timeout: 60000,
}, async (t) => {
	const fixture = await createFixture(t, {});
	await cp(join(packageRoot, "cases"), fixture, { recursive: true });
	const browser = await chromium.launchServer({ headless: true });
	t.after(() => browser.close());
	const run = await execute(
		t,
		fixture,
		["remote.case.ts", "websocket.case.ts"],
		LabExecutionModeEnum.test,
		browser.wsEndpoint(),
	);
	await run.exited;
	const results = run.events.filter(
		(event) => event.type === LabExecutionEventEnum.caseResult,
	);
	assert.deepEqual(
		results.map((event) => event.outcome),
		[LabCaseOutcomeEnum.passed, LabCaseOutcomeEnum.passed],
		JSON.stringify(
			{
				results,
				errors: run.events.filter((event) =>
					(JSON.stringify(event.data) ?? "").includes('"kind":"error"'),
				),
			},
			null,
			2,
		),
	);
	assert.ok(
		run.events.some((event) =>
			(JSON.stringify(event.data) ?? "").includes("HeadlessChrome"),
		),
	);
	assert.ok(
		run.events.some((event) =>
			(JSON.stringify(event.data) ?? "").includes('"kind":"wire"'),
		),
	);
	assert.ok(
		run.events.some((event) =>
			(JSON.stringify(event.data) ?? "").includes('"kind":"rpc"'),
		),
	);
	assert.ok(
		run.events.filter((event) => event.type === LabExecutionEventEnum.assertion)
			.length >= 20,
	);
	assert.ok(
		run.events
			.filter((event) => event.type === LabExecutionEventEnum.cleanup)
			.every((event) => event.complete),
	);
});

test("a real Remote recovery deadline expires while the debugger is paused", {
	timeout: 30000,
}, async (t) => {
	const fixture = await createFixture(t, {
		"expiry.case.ts":
			"export const labCase={title:'real recovery clock',async run(ctx){const server=await ctx.environment.node('services/server.ts');const browser=await ctx.environment.browser('services/browser-client.ts',{endpoint:server.result.endpoint});await ctx.step('disconnect',async()=>{await browser.call('stopReconnection');await browser.call('drop');});await ctx.step('inspect expired session',async()=>{const state=await browser.call('state');ctx.assert(state.peer.status==='closed'&&state.peer.reason==='recovery-expired','actual recovery elapsed during pause',state);});}};",
	});
	await cp(join(packageRoot, "cases/services"), join(fixture, "services"), {
		recursive: true,
	});
	const browser = await chromium.launchServer({ headless: true });
	t.after(() => browser.close());
	const run = await execute(
		t,
		fixture,
		["expiry.case.ts"],
		LabExecutionModeEnum.debug,
		browser.wsEndpoint(),
	);
	await run.until((event) => event.state === LabExecutionStateEnum.paused);
	run.child.send({ type: LabExecutionCommandEnum.step });
	await run.until(
		(event) =>
			event.state === LabExecutionStateEnum.paused &&
			event.stepId === "expiry.case.ts:2",
	);
	await run.until((event) =>
		(JSON.stringify(event.data) ?? "").includes("recovery-expired"),
	);
	assert.equal(
		run.events.some((event) => event.type === LabExecutionEventEnum.assertion),
		false,
	);
	run.child.send({ type: LabExecutionCommandEnum.continue });
	await run.exited;
	assert.equal(
		run.events.find((event) => event.type === LabExecutionEventEnum.caseResult)
			?.outcome,
		LabCaseOutcomeEnum.passed,
		JSON.stringify(run.events.slice(-8)),
	);
});

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

async function createFixture(t: TestContext, files: Record<string, string>) {
	const root = await mkdtemp(join(tmpdir(), "lab-execution-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(join(root, "package.json"), '{"type":"module"}');
	await symlink(
		join(packageRoot, "node_modules"),
		join(root, "node_modules"),
		"dir",
	);
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return root;
}

async function execute(
	t: TestContext,
	snapshotDir: string,
	entries: string[],
	mode = LabExecutionModeEnum.test,
	browserWSEndpoint?: string,
) {
	const events: LabExecutionEvent[] = [];
	const child = fork(join(packageRoot, "src/runtime/execution.ts"), [], {
		cwd: packageRoot,
		execArgv: ["--import", "tsx"],
		stdio: ["ignore", "pipe", "pipe", "ipc"],
		detached: true,
	});
	let stderr = "";
	child.stderr?.on("data", (data) => {
		stderr += String(data);
	});
	const exited = new Promise<number | null>((resolve) =>
		child.once("exit", resolve),
	);
	t.after(() => {
		try {
			if (child.pid) process.kill(-child.pid, "SIGKILL");
		} catch {}
	});
	child.on("message", (event: LabExecutionEvent) => events.push(event));
	const until = async (predicate: (event: LabExecutionEvent) => boolean) => {
		const deadline = Date.now() + 30000;
		while (!events.some(predicate)) {
			if (child.exitCode !== null)
				throw new Error(`Worker exited: ${stderr}\n${JSON.stringify(events)}`);
			if (Date.now() > deadline)
				throw new Error(
					`Execution did not reach expected state: ${stderr}\n${JSON.stringify(events.slice(-10))}`,
				);
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	};
	await until((event) => event.type === LabExecutionEventEnum.ready);
	child.send({
		type: LabExecutionCommandEnum.start,
		snapshotDir,
		entries,
		parameters: {},
		mode,
		...(browserWSEndpoint ? { browserWSEndpoint } : {}),
	});
	return { child, events, exited, until };
}
