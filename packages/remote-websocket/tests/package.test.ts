/**
 * @overview Installed remote WebSocket package release contract tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const coreRoot = resolve(workspaceRoot, "packages/core");
const remoteRoot = resolve(workspaceRoot, "packages/remote");
const fixtureRoot = mkdtempSync(
	join(tmpdir(), "husky-di-remote-websocket-pack-"),
);
const consumerRoot = resolve(fixtureRoot, "consumer");
let installedRoot = "";

function run(command: string, args: readonly string[], cwd: string): string {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, CI: "1" },
	});
	if (result.status !== 0) {
		throw new Error(
			[
				`Command failed: ${command} ${args.join(" ")}`,
				result.stdout,
				result.stderr,
			].join("\n"),
		);
	}
	return result.stdout;
}

function runPnpm(args: readonly string[], cwd: string): string {
	const npmExecPath = process.env.npm_execpath;
	return npmExecPath === undefined
		? run("pnpm", args, cwd)
		: run(process.execPath, [npmExecPath, ...args], cwd);
}

beforeAll(() => {
	runPnpm(["pack", "--pack-destination", fixtureRoot, "--json"], coreRoot);
	runPnpm(["pack", "--pack-destination", fixtureRoot, "--json"], remoteRoot);
	runPnpm(["pack", "--pack-destination", fixtureRoot, "--json"], packageRoot);
	const tarballs = readdirSync(fixtureRoot).filter((name) =>
		name.endsWith(".tgz"),
	);
	const coreTarball = tarballs.find((name) => name.includes("husky-di-core-"));
	const remoteTarball = tarballs.find(
		(name) =>
			name.includes("husky-di-remote-") && !name.includes("remote-websocket"),
	);
	const webSocketTarball = tarballs.find((name) =>
		name.includes("husky-di-remote-websocket-"),
	);
	if (
		coreTarball === undefined ||
		remoteTarball === undefined ||
		webSocketTarball === undefined
	) {
		throw new Error("pnpm pack did not create every required tarball.");
	}
	mkdirSync(consumerRoot);
	writeFileSync(
		resolve(consumerRoot, "package.json"),
		JSON.stringify({
			private: true,
			type: "module",
			dependencies: {
				"@husky-di/core": `file:${resolve(fixtureRoot, coreTarball)}`,
				"@husky-di/remote": `file:${resolve(fixtureRoot, remoteTarball)}`,
				"@husky-di/remote-websocket": `file:${resolve(fixtureRoot, webSocketTarball)}`,
			},
		}),
	);
	writeFileSync(
		resolve(consumerRoot, "pnpm-workspace.yaml"),
		`packages:\n  - "."\noverrides:\n  "@husky-di/core": "file:${resolve(
			fixtureRoot,
			coreTarball,
		)}"\n  "@husky-di/remote": "file:${resolve(fixtureRoot, remoteTarball)}"\n`,
	);
	runPnpm(
		["install", "--no-frozen-lockfile", "--ignore-scripts", "--prefer-offline"],
		consumerRoot,
	);
	rmSync(resolve(consumerRoot, "node_modules"), {
		recursive: true,
		force: true,
	});
	runPnpm(
		["install", "--frozen-lockfile", "--ignore-scripts", "--prefer-offline"],
		consumerRoot,
	);
	installedRoot = resolve(
		consumerRoot,
		"node_modules/@husky-di/remote-websocket",
	);
}, 120_000);

afterAll(() => {
	if (basename(fixtureRoot).startsWith("husky-di-remote-websocket-pack-")) {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

describe("installed @husky-di/remote-websocket package", () => {
	it("RPC-RELEASE-005 publishes the stable bounded Adapter artifact", () => {
		const manifestText = readFileSync(
			resolve(installedRoot, "package.json"),
			"utf8",
		);
		const manifest = JSON.parse(manifestText) as {
			readonly dependencies: Readonly<Record<string, string>>;
			readonly engines: { readonly node: string };
			readonly exports: Readonly<Record<string, unknown>>;
			readonly sideEffects: boolean;
		};
		expect(manifest).toMatchObject({
			sideEffects: false,
			engines: { node: ">=23.6" },
		});
		expect(manifest.dependencies["@husky-di/remote"]).toMatch(/^\^/);
		expect(manifestText).not.toContain("workspace:");
		expect(Object.keys(manifest.exports).sort()).toEqual([".", "./node"]);
		expect(readdirSync(installedRoot).sort()).toEqual([
			"CHANGELOG.md",
			"LICENSE",
			"README.md",
			"dist",
			"docs",
			"package.json",
		]);
		expect(readdirSync(resolve(installedRoot, "docs"))).toEqual([
			"SPECIFICATION.md",
		]);
		const specification = readFileSync(
			resolve(installedRoot, "docs/SPECIFICATION.md"),
			"utf8",
		);
		expect(specification).toContain("Status: Stable");
		expect(specification).toContain("Version: 1.0.0");
		const readme = readFileSync(resolve(installedRoot, "README.md"), "utf8");
		expect(readme).toMatch(/finite/i);
		expect(readme).toContain("maxPayload");
		expect(readme).toContain("wss:");
		expect(readme).toContain("createRpcConnectorReconnection");
		const changesets = readdirSync(resolve(workspaceRoot, ".changeset"))
			.filter((name) => name.endsWith(".md") && name !== "README.md")
			.map((name) =>
				readFileSync(resolve(workspaceRoot, ".changeset", name), "utf8"),
			);
		expect(
			changesets.some((contents) =>
				contents.includes('"@husky-di/remote-websocket": major'),
			),
		).toBe(true);
	});

	it("RPC-TRANSPORT-012 WS-SEC-001 documents the packaged secure-deployment boundary", () => {
		const documentation = [
			readFileSync(resolve(installedRoot, "README.md"), "utf8"),
			readFileSync(resolve(installedRoot, "docs/SPECIFICATION.md"), "utf8"),
		].join("\n");
		expect(documentation).toContain("confidentiality");
		expect(documentation).toMatch(/ordered\s+integrity\/anti-replay/);
		expect(documentation).toContain("authentication of the expected responder");
		expect(documentation).toContain("wss:");
		expect(documentation).toContain("does not prove network security");
		expect(documentation).toContain(
			"does not authenticate the initiating application",
		);
		expect(documentation).toContain("before handing");
		expect(documentation).toContain("per-principal connection");
	});

	it("RPC-RELEASE-005 resolves packed ESM and CJS while rejecting private deep imports", () => {
		const esmPath = resolve(consumerRoot, "consumer.mjs");
		writeFileSync(
			esmPath,
			`import assert from "node:assert/strict";
import * as browser from "@husky-di/remote-websocket";
import * as node from "@husky-di/remote-websocket/node";
assert.deepEqual(Object.keys(browser), ["createWebSocketConnectorAdapter"]);
assert.deepEqual(Object.keys(node).sort(), ["createNodeWebSocketAcceptorAdapter", "createNodeWebSocketConnectorAdapter"]);
await assert.rejects(
  import("@husky-di/remote-websocket/dist/impls/web-socket-connection.impl.js"),
  (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
`,
		);
		run(process.execPath, [esmPath], consumerRoot);

		const cjsPath = resolve(consumerRoot, "consumer.cjs");
		writeFileSync(
			cjsPath,
			`const assert = require("node:assert/strict");
const browser = require("@husky-di/remote-websocket");
const node = require("@husky-di/remote-websocket/node");
assert.deepEqual(Object.keys(browser), ["createWebSocketConnectorAdapter"]);
assert.deepEqual(Object.keys(node).sort(), ["createNodeWebSocketAcceptorAdapter", "createNodeWebSocketConnectorAdapter"]);
assert.throws(
  () => require("@husky-di/remote-websocket/dist/impls/web-socket-connection.impl.cjs"),
  (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
`,
		);
		run(process.execPath, [cjsPath], consumerRoot);
	});
});
