/**
 * @overview Playwright browser compatibility release evidence.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { build } from "esbuild";

const browserTestRoot = dirname(fileURLToPath(import.meta.url));
const outputRoot = mkdtempSync(join(tmpdir(), "husky-di-remote-browser-"));
const bundlePath = resolve(outputRoot, "browser-roundtrip.js");
const server = createServer((_request, response) => {
	response.setHeader("content-type", "text/html; charset=utf-8");
	response.end("<!doctype html><html><body></body></html>");
});
let browserOrigin = "";

function runPnpm(args: readonly string[], cwd: string): void {
	execFileSync("corepack", ["pnpm", ...args], { cwd, stdio: "inherit" });
}

test.beforeAll(async () => {
	let entryPoint = resolve(browserTestRoot, "test.utils.ts");
	const authoritativeTarball = process.env.HUSKY_REMOTE_TGZ;
	if (authoritativeTarball !== undefined) {
		const supportCoreTarball = process.env.HUSKY_CORE_TGZ;
		if (supportCoreTarball === undefined) {
			throw new Error("Installed browser evidence requires HUSKY_CORE_TGZ.");
		}
		writeFileSync(
			resolve(outputRoot, "package.json"),
			JSON.stringify({
				private: true,
				type: "module",
				packageManager: "pnpm@11.13.1",
				pnpm: {
					overrides: {
						"@husky-di/core": `file:${resolve(supportCoreTarball)}`,
					},
				},
				dependencies: {
					"@husky-di/core": `file:${resolve(supportCoreTarball)}`,
					"@husky-di/remote": `file:${resolve(authoritativeTarball)}`,
					rxjs: "7.8.2",
				},
			}),
		);
		runPnpm(
			[
				"install",
				"--ignore-workspace",
				"--no-frozen-lockfile",
				"--ignore-scripts",
				"--prefer-offline",
			],
			outputRoot,
		);
		const installedFixture = readFileSync(
			resolve(browserTestRoot, "test.utils.ts"),
			"utf8",
		)
			.replace(
				'import { createServiceIdentifier } from "@husky-di/core";',
				"const createServiceIdentifier = <T>(_name: string): never => Object.freeze({}) as never;",
			)
			.replace('from "../../src/index"', 'from "@husky-di/remote"')
			.replace(
				'from "../../wire/husky-di-rpc-1/known-answer-vectors.json"',
				'from "@husky-di/remote/wire/husky-di-rpc-1/security-vectors"',
			);
		entryPoint = resolve(outputRoot, "installed-browser.fixture.ts");
		writeFileSync(entryPoint, installedFixture);
	}
	await build({
		bundle: true,
		entryPoints: [entryPoint],
		format: "iife",
		globalName: "HuskyDiBrowserEvidence",
		outfile: bundlePath,
		platform: "browser",
		sourcemap: "inline",
		target: "es2022",
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address() as AddressInfo;
	browserOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
	await server[Symbol.asyncDispose]();
	if (basename(outputRoot).startsWith("husky-di-remote-browser-")) {
		rmSync(outputRoot, { recursive: true, force: true });
	}
});

test("RPC-RELEASE-002 runs WebCrypto, cross-realm cancellation, Recovery, and termination", async ({
	page,
}) => {
	await page.goto(browserOrigin);
	await page.addScriptTag({ path: bundlePath });
	const result = await page.evaluate(async () => {
		const fixture = (
			globalThis as typeof globalThis & {
				readonly HuskyDiBrowserEvidence: {
					runRpcBrowserRoundtrip(): Promise<{
						readonly acceptorStatus: string;
						readonly assimilated: boolean;
						readonly canceledCode: string;
						readonly connectorStatus: string;
						readonly initialResult: number;
						readonly streamItems: readonly number[];
						readonly streamProperty: string;
						readonly recoveredResult: number;
						readonly sameAcceptorPeer: boolean;
						readonly sameConnectorPeer: boolean;
						readonly shadowListenerCalls: number;
						readonly webCrypto: boolean;
						readonly webCryptoVectors: boolean;
					}>;
				};
			}
		).HuskyDiBrowserEvidence;
		return fixture.runRpcBrowserRoundtrip();
	});

	expect(result).toEqual({
		acceptorStatus: "closed",
		assimilated: true,
		canceledCode: "canceled",
		connectorStatus: "closed",
		initialResult: 42,
		streamItems: [0, 1, 2],
		streamProperty: "ready",
		recoveredResult: 42,
		sameAcceptorPeer: true,
		sameConnectorPeer: true,
		shadowListenerCalls: 0,
		webCrypto: true,
		webCryptoVectors: true,
	});
});
