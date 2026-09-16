/**
 * @overview Verifies optimistic editing, imported source snapshots, project language semantics and durable bounded history.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fileSystem, {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, it, mock } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPlatformProject } from "@/factories/platform-project.factory";
import { claimPlatformProject } from "@/utils/claim-platform-project.util";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

async function fixture() {
	const path = await mkdtemp(join(tmpdir(), "remote-lab-project-"));
	directories.push(path);
	await writeFile(
		join(path, "package.json"),
		JSON.stringify({ type: "module" }),
	);
	await writeFile(
		join(path, "sample.case.ts"),
		"export const labCase = { title: 'draft', run() {} };\n",
	);
	return path;
}

it("EXAMPLE-LAB-PLATFORM-PROJECT discovers cases without evaluation and preserves both IDE and editor conflict contents", async () => {
	const rootPath = await fixture();
	await writeFile(
		join(rootPath, "side-effect.case.ts"),
		"throw new Error('never evaluate discovery'); export const labCase = {};\n",
	);
	const project = await createPlatformProject({ rootPath });
	assert.equal(
		(await project.describe()).files.filter((file) => file.isCase).length,
		2,
	);
	const initial = await project.readFile("sample.case.ts");
	await writeFile(join(rootPath, "sample.case.ts"), "// IDE version\n");
	const conflict = await project.saveFile(
		"sample.case.ts",
		"// browser draft\n",
		initial.revision,
	);
	assert.equal(conflict.saved, false);
	assert.equal(conflict.conflict?.draft, "// browser draft\n");
	assert.equal(conflict.conflict?.disk?.content, "// IDE version\n");
	assert.equal(
		await readFile(join(rootPath, "sample.case.ts"), "utf8"),
		"// IDE version\n",
	);
	assert.ok(conflict.file);
	const resolved = await project.saveFile(
		"sample.case.ts",
		"// explicitly merged\n",
		conflict.file.revision,
	);
	assert.equal(resolved.saved, true);
	assert.equal(
		(await project.readFile("sample.case.ts")).content,
		"// explicitly merged\n",
	);
	assert.equal(
		(
			await project.saveFile(
				"nested/new.case.ts",
				"export const labCase = {};",
				null,
			)
		).saved,
		true,
	);
	assert.equal(
		(await project.saveFile("nested/new.case.ts", "must not replace", null))
			.saved,
		false,
	);
	assert.ok(resolved.file);
	await rm(join(rootPath, "sample.case.ts"));
	assert.deepEqual(
		(
			await project.saveFile(
				"sample.case.ts",
				"kept draft",
				resolved.file.revision,
			)
		).conflict,
		{ draft: "kept draft", disk: null },
	);
	await assert.rejects(
		project.saveFile("../outside.ts", "escape", null),
		/inside the editable project/,
	);
	await symlink(tmpdir(), join(rootPath, "external"));
	await assert.rejects(
		project.saveFile("external/escape.ts", "escape", null),
		/symlink/,
	);
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-SNAPSHOT executes saved imports while later edits produce a new snapshot", async () => {
	const rootPath = await fixture();
	await writeFile(join(rootPath, "helper.ts"), "export const value = 7;\n");
	await writeFile(
		join(rootPath, "sample.case.ts"),
		"import { value } from './helper.ts'; export const labCase = { run: () => value + 1 };\n",
	);
	await writeFile(join(rootPath, "asset.bin"), Buffer.from([0, 255, 7, 88]));
	for (const excluded of ["node_modules", ".git", ".remote-lab"]) {
		await mkdir(join(rootPath, excluded), { recursive: true });
		await writeFile(join(rootPath, excluded, "excluded.ts"), "excluded");
	}
	const project = await createPlatformProject({ rootPath });
	const parameters = { amount: 3 };
	const snapshot = await project.snapshot({
		entry: "sample.case.ts",
		parameters,
		environment: { chromium: "test version" },
	});
	parameters.amount = 100;
	await writeFile(join(rootPath, "helper.ts"), "export const value = 70;\n");
	await writeFile(
		join(rootPath, "sample.case.ts"),
		"import { value } from './helper.ts'; export const labCase = { run: () => value + 2 };\n",
	);
	const directory = await mkdtemp(join(tmpdir(), "remote-lab-snapshot-"));
	directories.push(directory);
	await project.materializeSnapshot(snapshot, directory);
	const module = await import(
		pathToFileURL(join(directory, snapshot.entry)).href
	);
	assert.equal(module.labCase.run(), 8);
	assert.equal(snapshot.parameters.amount, 3);
	assert.deepEqual(
		await readFile(join(directory, "asset.bin")),
		Buffer.from([0, 255, 7, 88]),
	);
	assert.ok(
		Object.keys(snapshot.files).every((path) => !path.includes("excluded")),
	);
	assert.equal(snapshot.environment.chromium, "test version");
	assert.match(snapshot.dependencies.typescript, /^\d/);
	const next = await project.snapshot({ entry: "sample.case.ts" });
	assert.notEqual(next.id, snapshot.id);
	assert.equal(next.files["helper.ts"], "export const value = 70;\n");
	assert.equal(snapshot.files["helper.ts"], "export const value = 7;\n");
	await assert.rejects(
		project.snapshot({ entry: "missing.case.ts" }),
		/does not exist/,
	);
	const limited = await createPlatformProject({
		rootPath,
		maxSnapshotBytes: 1,
	});
	await assert.rejects(
		limited.snapshot({ entry: "sample.case.ts" }),
		/no partial snapshot/,
	);
	limited.dispose();
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-HISTORY persists bounded source and results without reviving active runs after restart", async () => {
	const rootPath = await fixture();
	const project = await createPlatformProject({ rootPath, maxHistoryCount: 2 });
	const snapshot = await project.snapshot({ entry: "sample.case.ts" });
	await project.saveHistory({
		id: "first",
		snapshot,
		active: false,
		data: { result: "failed", events: [] },
	});
	await project.saveHistory({
		id: "second",
		snapshot,
		active: false,
		data: { result: "unverified", events: [] },
	});
	await project.saveHistory({
		id: "active",
		snapshot,
		active: true,
		data: {
			result: "pending",
			cleanup: "pending",
			events: [{ type: "step", name: "working" }],
		},
	});
	assert.equal((await project.listHistory()).length, 2);
	await assert.rejects(project.readHistory("first"), /ENOENT/);
	await assert.rejects(project.deleteHistory("active"), /Stop the active run/);
	project.dispose();
	const reopened = await createPlatformProject({
		rootPath,
		maxHistoryCount: 2,
	});
	const interrupted = await reopened.readHistory("active");
	assert.equal(interrupted.active, false);
	assert.equal(interrupted.interrupted, true);
	assert.equal(interrupted.data.cleanup, "pending");
	assert.match(
		interrupted.recordingNotice ?? "",
		/before execution and cleanup were confirmed/,
	);
	assert.equal(
		interrupted.snapshot.files["sample.case.ts"],
		snapshot.files["sample.case.ts"],
	);
	await reopened.deleteHistory("second");
	assert.equal((await reopened.listHistory()).length, 1);
	reopened.dispose();
});

it("EXAMPLE-LAB-PLATFORM-HISTORY truncates observations while preserving assertion evidence and verdict within capacity", async () => {
	const rootPath = await fixture();
	const project = await createPlatformProject({
		rootPath,
		maxHistoryBytes: 3500,
	});
	const snapshot = await project.snapshot({ entry: "sample.case.ts" });
	const events = [
		{ type: "step", name: "operation" },
		...Array.from({ length: 30 }, (_, sequence) => ({
			type: "record",
			sequence,
			message: "payload".repeat(50),
		})),
		{
			type: "assertion",
			passed: false,
			message: "actual must be 1",
			actual: 2,
		},
		{ type: "case-result", outcome: "failed" },
	];
	const saved = await project.saveHistory({
		id: "large",
		snapshot,
		active: false,
		data: { result: "failed", events },
	});
	assert.equal(saved.recordingTruncated, true);
	assert.equal(saved.data.result, "failed");
	const retained = saved.data.events as typeof events;
	assert.equal(
		retained.filter((event) => event.type === "assertion").length,
		1,
	);
	assert.equal(
		retained.filter((event) => event.type === "case-result").length,
		1,
	);
	assert.ok(retained.length < events.length);
	assert.ok(
		(await project.listHistory()).reduce(
			(bytes, record) => bytes + record.bytes,
			0,
		) <= 3500,
	);
	await assert.rejects(
		project.saveHistory({
			id: "too-large",
			snapshot,
			active: false,
			data: {
				result: "unverified",
				assertions: "required evidence".repeat(500),
			},
		}),
		/too small to preserve/,
	);
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-LANGUAGE diagnoses project sources and resolves imported definitions, completions and SDK types", async () => {
	const rootPath = await fixture();
	await writeFile(
		join(rootPath, "helper.ts"),
		"export const item = { value: 3, description: 'label' };\nexport const broken: number = 'wrong';\n",
	);
	const source =
		"import { item } from './helper.ts';\nimport type { ILabCase } from '@husky-di/example-remote-lab/sdk';\nexport const labCase: ILabCase = { title: 'typed', async run(ctx) { await ctx.step('works', () => ctx.assert(item.value === 3, 'value')); } };\nitem.value;\n";
	await writeFile(join(rootPath, "sample.case.ts"), source);
	const project = await createPlatformProject({ rootPath });
	const diagnostics = await project.diagnostics();
	assert.ok(
		diagnostics.some(
			(diagnostic) =>
				diagnostic.path === "helper.ts" && diagnostic.code === 2322,
		),
		JSON.stringify(diagnostics),
	);
	assert.ok(
		!diagnostics.some((diagnostic) => diagnostic.path === "sample.case.ts"),
		JSON.stringify(diagnostics),
	);
	const completions = await project.completions(
		"sample.case.ts",
		source.lastIndexOf("item.value") + 5,
	);
	assert.ok(completions.some((entry) => entry.name === "description"));
	const definitions = await project.definitions(
		"sample.case.ts",
		source.lastIndexOf("item.value") + 1,
	);
	assert.ok(definitions.some((definition) => definition.path === "helper.ts"));
	const sdk = await project.definitions(
		"sample.case.ts",
		source.indexOf("ILabCase =") + 2,
	);
	assert.ok(
		sdk.some((definition) => definition.path.endsWith("lab-case.interface.ts")),
	);
	assert.match(
		(await project.readDefinition(sdk[0].path)).content,
		/interface ILabCase/,
	);
	await assert.rejects(
		project.readDefinition("/etc/passwd"),
		/Only sources returned/,
	);
	const overlay = await project.diagnostics({
		"helper.ts":
			"export const item = { value: 3, description: 'label' };\nexport const broken: number = 1;\n",
	});
	assert.equal(overlay.length, 0, JSON.stringify(overlay));
	assert.match(await readFile(join(rootPath, "helper.ts"), "utf8"), /'wrong'/);
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-OWNERSHIP rejects live services and reclaims only a confirmed dead process", async () => {
	const rootPath = await fixture();
	const release = await claimPlatformProject(rootPath);
	await assert.rejects(
		claimPlatformProject(rootPath),
		/already owned by live service.*--url/,
	);
	await Promise.all([release(), release()]);
	await release();
	const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
		stdio: "ignore",
	});
	await once(child, "spawn");
	assert.ok(child.pid);
	const lock = join(rootPath, ".remote-lab/project.lock");
	await mkdir(lock, { recursive: true });
	await writeFile(
		join(lock, "owner.json"),
		JSON.stringify({
			pid: child.pid,
			token: "previous-owner",
			createdAt: Date.now(),
		}),
	);
	try {
		await assert.rejects(
			claimPlatformProject(rootPath),
			/already owned by live service/,
		);
	} finally {
		child.kill("SIGKILL");
		await once(child, "exit");
	}
	const recovered = await claimPlatformProject(rootPath);
	const owner = JSON.parse(await readFile(join(lock, "owner.json"), "utf8"));
	assert.equal(owner.pid, process.pid);
	assert.notEqual(owner.token, "previous-owner");
	await recovered();
	const claims = await Promise.allSettled([
		claimPlatformProject(rootPath),
		claimPlatformProject(rootPath),
	]);
	assert.equal(
		claims.filter((claim) => claim.status === "fulfilled").length,
		1,
	);
	for (const claim of claims)
		if (claim.status === "fulfilled") await claim.value();
});

it("EXAMPLE-LAB-PLATFORM-SNAPSHOT rejects mutable local imports outside the selected project", async () => {
	const rootPath = await fixture();
	const project = await createPlatformProject({ rootPath });
	for (const source of [
		"import '../outside.ts';",
		"export { other } from '../outside.ts';",
		"const outside = import('../outside.ts');",
		"const outside = require('../outside.ts');",
		"import '/tmp/outside.ts';",
	]) {
		await writeFile(
			join(rootPath, "sample.case.ts"),
			`${source} export const labCase = {};`,
		);
		await assert.rejects(
			project.snapshot({ entry: "sample.case.ts" }),
			/project snapshot/,
		);
	}
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-PROJECT retains IDE bytes changed during capture and never overwrites a concurrent recreated pathname", async () => {
	const rootPath = await fixture();
	const project = await createPlatformProject({ rootPath });
	const destination = join(project.rootPath, "sample.case.ts");
	for (const timing of ["before", "after"]) {
		await writeFile(destination, "// baseline");
		const baseline = await project.readFile("sample.case.ts");
		const originalRename = fileSystem.rename;
		const interception = mock.method(
			fileSystem,
			"rename",
			async (
				from: Parameters<typeof fileSystem.rename>[0],
				to: Parameters<typeof fileSystem.rename>[1],
			) => {
				const capturesSource = String(from) === destination;
				if (capturesSource && timing === "before")
					await writeFile(destination, "// IDE before capture");
				await originalRename(from, to);
				if (capturesSource && timing === "after")
					await writeFile(destination, "// IDE recreated pathname");
			},
		);
		syncBuiltinESMExports();
		try {
			const saved = await project.saveFile(
				"sample.case.ts",
				"// browser draft",
				baseline.revision,
			);
			assert.equal(saved.saved, false);
			assert.equal(saved.conflict?.draft, "// browser draft");
			assert.equal(
				saved.conflict?.disk?.content,
				timing === "before"
					? "// IDE before capture"
					: "// IDE recreated pathname",
			);
			assert.ok(saved.conflict?.preserved);
			assert.equal(
				await readFile(join(rootPath, saved.conflict.preserved.path), "utf8"),
				timing === "before" ? "// IDE before capture" : "// baseline",
			);
		} finally {
			interception.mock.restore();
			syncBuiltinESMExports();
		}
	}
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-HISTORY evicts finished records before an older active record", async () => {
	const rootPath = await fixture();
	const project = await createPlatformProject({ rootPath, maxHistoryCount: 1 });
	const snapshot = await project.snapshot({ entry: "sample.case.ts" });
	await project.saveHistory({
		id: "running",
		snapshot,
		active: true,
		data: { result: "pending" },
	});
	await project.saveHistory({
		id: "finished",
		snapshot,
		active: false,
		data: { result: "passed" },
	});
	assert.deepEqual(
		(await project.listHistory()).map((record) => record.id),
		["running"],
	);
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-HISTORY lists verdict metadata without loading source and event payloads into list responses", async () => {
	const rootPath = await fixture();
	const project = await createPlatformProject({ rootPath });
	const snapshot = await project.snapshot({
		entry: "sample.case.ts",
		parameters: { amount: 3 },
	});
	await project.saveHistory({
		id: "summary",
		snapshot,
		active: false,
		data: {
			result: "failed",
			cleanup: "complete",
			events: [{ type: "record", message: "large-observation-payload" }],
		},
	});
	const summaries = await project.listHistory();
	assert.equal(summaries[0].data.result, "failed");
	assert.equal(summaries[0].data.cleanup, "complete");
	assert.equal(Object.hasOwn(summaries[0].data, "events"), false);
	assert.equal(Object.hasOwn(summaries[0].data, "snapshot"), false);
	assert.equal(
		JSON.stringify(summaries).includes("large-observation-payload"),
		false,
	);
	assert.equal(
		JSON.stringify(summaries).includes(snapshot.files["sample.case.ts"]),
		false,
	);
	assert.ok((await project.readHistory("summary")).data.events);
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-LANGUAGE provides Node defaults for the real builtin sources and honors explicit ambient type controls", async () => {
	const rootPath = await fixture();
	await fileSystem.cp(
		fileURLToPath(new URL("../../cases", import.meta.url)),
		rootPath,
		{ recursive: true, filter: (path) => !path.includes(".remote-lab") },
	);
	const project = await createPlatformProject({ rootPath });
	assert.deepEqual(await project.diagnostics(), []);
	await writeFile(
		join(rootPath, "ambient.ts"),
		"export const pid = process.pid;\n",
	);
	await writeFile(
		join(rootPath, "tsconfig.json"),
		JSON.stringify({ compilerOptions: { types: [] } }),
	);
	assert.ok(
		(await project.diagnostics()).some(
			(diagnostic) =>
				diagnostic.path === "ambient.ts" &&
				diagnostic.message.includes("process"),
		),
	);
	await writeFile(
		join(rootPath, "tsconfig.json"),
		JSON.stringify({ compilerOptions: { typeRoots: [] } }),
	);
	assert.ok(
		(await project.diagnostics()).some(
			(diagnostic) =>
				diagnostic.path === "ambient.ts" &&
				diagnostic.message.includes("process"),
		),
	);
	await writeFile(
		join(rootPath, "tsconfig.json"),
		JSON.stringify({ compilerOptions: { types: ["node"] } }),
	);
	assert.deepEqual(await project.diagnostics(), []);
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-SNAPSHOT admits the default builtin source path and records the supplied execution dependency versions", async () => {
	const statePath = await fixture();
	const rootPath = fileURLToPath(new URL("../../cases", import.meta.url));
	const project = await createPlatformProject({
		rootPath,
		historyPath: join(statePath, "history"),
	});
	const snapshot = await project.snapshot({ entry: "remote.case.ts" });
	assert.equal(
		snapshot.files["remote.case.ts"],
		await readFile(join(rootPath, "remote.case.ts"), "utf8"),
	);
	assert.ok(snapshot.files["services/server.ts"]);
	for (const name of ["rxjs", "esbuild"])
		assert.match(snapshot.dependencies[name], /^\d+\./);
	project.dispose();
});

it("EXAMPLE-LAB-PLATFORM-SNAPSHOT allows declaration-only SDK syntax while rejecting executable SDK or local escape imports", async () => {
	const rootPath = await fixture();
	const project = await createPlatformProject({ rootPath });
	for (const source of [
		"import type { ILabCase } from '@husky-di/example-remote-lab/sdk';",
		"import { type ILabCase } from '@husky-di/example-remote-lab/sdk';",
		"export type { ILabCase } from '@husky-di/example-remote-lab/sdk';",
		"export { type ILabCase } from '@husky-di/example-remote-lab/sdk';",
	]) {
		await writeFile(
			join(rootPath, "sample.case.ts"),
			`${source} export const labCase = { title: 'SDK', run() {} };`,
		);
		await project.snapshot({ entry: "sample.case.ts" });
	}
	for (const source of [
		"import { ILabCase } from '@husky-di/example-remote-lab/sdk';",
		"import('@husky-di/example-remote-lab/sdk');",
		"import '../outside.ts';",
	]) {
		await writeFile(
			join(rootPath, "sample.case.ts"),
			`${source} export const labCase = {};`,
		);
		await assert.rejects(
			project.snapshot({ entry: "sample.case.ts" }),
			/type-only dependency|project snapshot/,
		);
	}
	project.dispose();
});
