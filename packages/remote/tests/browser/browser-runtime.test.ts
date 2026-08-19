/**
 * @overview Playwright browser compatibility release evidence.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

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
	await new Promise<void>((resolveListen, rejectListen) => {
		server.once("error", rejectListen);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", rejectListen);
			resolveListen();
		});
	});
	const address = server.address() as AddressInfo;
	browserOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
	await new Promise<void>((resolveClose, rejectClose) => {
		server.close((error) => {
			if (error === undefined) {
				resolveClose();
			} else {
				rejectClose(error);
			}
		});
	});
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
		recoveredResult: 42,
		sameAcceptorPeer: true,
		sameConnectorPeer: true,
		shadowListenerCalls: 0,
		webCrypto: true,
		webCryptoVectors: true,
	});
});
