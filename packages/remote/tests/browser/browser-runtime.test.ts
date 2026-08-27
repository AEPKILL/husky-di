/**
 * @overview Playwright browser compatibility release evidence.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
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

test.beforeAll(async () => {
	await build({
		bundle: true,
		entryPoints: [resolve(browserTestRoot, "test.utils.ts")],
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

test("RPC-CORPUS-001 RPC-RELEASE-002 runs CSPRNG bearer Recovery, cross-realm cancellation, and termination", async ({
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
						readonly browserCsprng: boolean;
						readonly canceledCode: string;
						readonly connectorStatus: string;
						readonly initialResult: number;
						readonly profileV1: boolean;
						readonly recoveredResult: number;
						readonly resumeAcceptOmitsToken: boolean;
						readonly resumeTokenCanonical: boolean;
						readonly resumeTokenStable: boolean;
						readonly sameAcceptorPeer: boolean;
						readonly sameConnectorPeer: boolean;
						readonly shadowListenerCalls: number;
					}>;
				};
			}
		).HuskyDiBrowserEvidence;
		return fixture.runRpcBrowserRoundtrip();
	});

	expect(result).toEqual({
		acceptorStatus: "closed",
		assimilated: true,
		browserCsprng: true,
		canceledCode: "canceled",
		connectorStatus: "closed",
		initialResult: 42,
		profileV1: true,
		recoveredResult: 42,
		resumeAcceptOmitsToken: true,
		resumeTokenCanonical: true,
		resumeTokenStable: true,
		sameAcceptorPeer: true,
		sameConnectorPeer: true,
		shadowListenerCalls: 0,
	});
});
