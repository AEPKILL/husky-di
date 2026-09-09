/**
 * @overview Verifies packed WebSocket entrypoints, declarations and browser isolation.
 * @author AEPKILL
 * @created 2026-09-09 23:00:00
 */

import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = mkdtempSync(join(tmpdir(), "husky-di-websocket-pack-"));
const installedRoot = resolve(
	fixtureRoot,
	"node_modules/@husky-di/remote-websocket",
);

beforeAll(() => {
	writeFileSync(
		resolve(fixtureRoot, "package.json"),
		JSON.stringify({ private: true, type: "module" }),
	);
	for (const name of ["core", "remote", "remote-websocket"]) {
		const archiveRoot = resolve(fixtureRoot, "archives", name);
		mkdirSync(archiveRoot, { recursive: true });
		const npmExecPath = process.env.npm_execpath;
		const args = ["pack", "--pack-destination", archiveRoot, "--json"];
		run(
			npmExecPath === undefined ? "pnpm" : process.execPath,
			npmExecPath === undefined ? args : [npmExecPath, ...args],
			resolve(packageRoot, "..", name),
		);
		const archive = readdirSync(archiveRoot).find((file) =>
			file.endsWith(".tgz"),
		);
		if (!archive) throw new Error(`Missing ${name} package archive.`);
		const destination = resolve(fixtureRoot, "node_modules/@husky-di", name);
		mkdirSync(destination, { recursive: true });
		run("tar", [
			"-xzf",
			resolve(archiveRoot, archive),
			"-C",
			destination,
			"--strip-components=1",
		]);
	}
	// Workspace dependencies come from the archives; reuse only installed third-party packages.
	for (const [name, workspace] of [
		["rxjs", "remote-websocket"],
		["ws", "remote-websocket"],
		["zod", "remote"],
	]) {
		const destination = resolve(fixtureRoot, "node_modules", name);
		mkdirSync(dirname(destination), { recursive: true });
		symlinkSync(
			realpathSync(resolve(packageRoot, "..", workspace, "node_modules", name)),
			destination,
			"dir",
		);
	}
}, 120_000);

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

describe("packed WebSocket Adapter", () => {
	it("WS-PKG-001 RPC-RELEASE-005 ships its contract without private source", () => {
		const manifestText = readFileSync(
			resolve(installedRoot, "package.json"),
			"utf8",
		);
		const manifest = JSON.parse(manifestText) as {
			exports: Record<string, unknown>;
			dependencies: Record<string, string>;
		};
		expect(Object.keys(manifest.exports).sort()).toEqual([".", "./node"]);
		expect(manifest.dependencies["@husky-di/remote"]).toBeTruthy();
		expect(manifestText).not.toContain("workspace:");
		expect(readdirSync(installedRoot).sort()).toEqual([
			"CHANGELOG.md",
			"LICENSE",
			"README.md",
			"dist",
			"docs",
			"package.json",
		]);
		expect(
			readFileSync(resolve(installedRoot, "docs/SPECIFICATION.md"), "utf8"),
		).toContain("WS-PKG-001");
	});

	for (const extension of ["mjs", "cjs"]) {
		it(`WS-API-001 WS-PKG-001 resolves ${extension} exports and rejects private imports`, () => {
			const imports =
				extension === "mjs"
					? 'import assert from "node:assert/strict";\nimport { createRequire } from "node:module";\nimport * as browser from "@husky-di/remote-websocket";\nimport * as node from "@husky-di/remote-websocket/node";\nconst require = createRequire(import.meta.url);'
					: 'const assert = require("node:assert/strict");\nconst browser = require("@husky-di/remote-websocket");\nconst node = require("@husky-di/remote-websocket/node");';
			const entry = resolve(fixtureRoot, `consumer.${extension}`);
			writeFileSync(
				entry,
				`${imports}
assert.deepEqual(Object.keys(browser), ["createWebSocketConnectorAdapter"]);
assert.deepEqual(Object.keys(node).sort(), ["createNodeWebSocketAcceptorAdapter", "createNodeWebSocketConnectorAdapter"]);
assert.throws(() => require("@husky-di/remote-websocket/dist/index.js"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
`,
			);
			run(process.execPath, [entry]);
		});
	}

	it("WS-API-001 WS-PKG-001 compiles a DOM-only consumer and browser bundle", () => {
		const entry = resolve(fixtureRoot, "browser.ts");
		writeFileSync(
			entry,
			`import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import type { IRpcConnectorAdapter } from "@husky-di/remote/transport";
const adapter: IRpcConnectorAdapter = createWebSocketConnectorAdapter({ url: "ws://localhost/rpc", webSocket: WebSocket, protocols: ["rpc"] });
// @ts-expect-error Node factories are deliberately absent from the browser root.
import { createNodeWebSocketAcceptorAdapter } from "@husky-di/remote-websocket";
void adapter;
`,
		);
		compile("browser.ts", []);
		// Bundle a runtime-only entry so the negative declaration assertion stays type-only evidence.
		writeFileSync(
			entry,
			'export { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";',
		);
		const metadata = resolve(fixtureRoot, "browser-meta.json");
		run(resolve(packageRoot, "node_modules/.bin/esbuild"), [
			entry,
			"--bundle",
			"--platform=browser",
			"--format=esm",
			`--metafile=${metadata}`,
			`--outfile=${resolve(fixtureRoot, "browser.js")}`,
		]);
		const inputs = Object.keys(
			(
				JSON.parse(readFileSync(metadata, "utf8")) as {
					inputs: Record<string, unknown>;
				}
			).inputs,
		);
		expect(
			inputs.some(
				(input) =>
					/(?:^|\/)ws\//.test(input) || input.includes("/modules/node/"),
			),
		).toBe(false);
	});

	it("WS-API-001 WS-PKG-001 compiles strict Node options against installed declarations", () => {
		mkdirSync(resolve(fixtureRoot, "node_modules/@types"), { recursive: true });
		for (const name of ["node", "ws"]) {
			symlinkSync(
				realpathSync(resolve(packageRoot, "node_modules/@types", name)),
				resolve(fixtureRoot, "node_modules/@types", name),
				"dir",
			);
		}
		writeFileSync(
			resolve(fixtureRoot, "node.ts"),
			`import { createServer } from "node:http";
import { createNodeWebSocketAcceptorAdapter, createNodeWebSocketConnectorAdapter } from "@husky-di/remote-websocket/node";
import type { IRpcAcceptorAdapter, IRpcConnectorAdapter } from "@husky-di/remote/transport";
const acceptor: IRpcAcceptorAdapter = createNodeWebSocketAcceptorAdapter({ server: createServer(), path: "/rpc", maxConnections: 4 });
const connector: IRpcConnectorAdapter = createNodeWebSocketConnectorAdapter({ url: new URL("ws://localhost/rpc"), headers: { authorization: "example" }, handshakeTimeoutMs: 1000 });
void [acceptor, connector];
`,
		);
		compile("node.ts", ["node"]);
	});
});

function compile(entry: string, types: string[]): void {
	writeFileSync(
		resolve(fixtureRoot, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				skipLibCheck: false,
				noEmit: true,
				lib: ["ES2023", "DOM"],
				module: "ESNext",
				moduleResolution: "Bundler",
				types,
			},
			include: [entry],
		}),
	);
	run(process.execPath, [
		resolve(packageRoot, "node_modules/typescript/bin/tsc"),
		"-p",
		fixtureRoot,
	]);
}

function run(
	command: string,
	args: readonly string[],
	cwd = fixtureRoot,
): string {
	return execFileSync(command, args, {
		cwd,
		encoding: "utf8",
		timeout: 30_000,
		env: { ...process.env, CI: "1" },
	});
}
