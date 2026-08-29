/**
 * @overview Bundle and run the DOM-only proposed fixture in all repository
 * browser engines. Generated bundles live in an OS temporary directory.
 *
 * @author AEPKILL
 * @created 2026-08-23 00:00:00
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	chromium,
	firefox,
	webkit,
} from "../../../../packages/remote/node_modules/@playwright/test/index.mjs";
import { build } from "../../../../packages/remote/node_modules/esbuild/lib/main.js";

const prototypeDirectory = fileURLToPath(new URL(".", import.meta.url));
const rxjsBrowserEntry = fileURLToPath(
	new URL(
		"../../../../packages/remote/node_modules/rxjs/dist/esm/index.js",
		import.meta.url,
	),
);
const temporaryDirectory = await mkdtemp(
	join(tmpdir(), "husky-ticket13-browser-"),
);
const outputPath = join(temporaryDirectory, "browser-consumer.js");

try {
	await build({
		alias: { rxjs: rxjsBrowserEntry },
		bundle: true,
		entryPoints: [join(prototypeDirectory, "browser-consumer.ts")],
		format: "iife",
		globalName: "FinalStreamInterfaceBrowser",
		outfile: outputPath,
		platform: "browser",
		target: ["es2024"],
	});

	const results = [];
	for (const [name, browserType] of [
		["chromium", chromium],
		["firefox", firefox],
		["webkit", webkit],
	]) {
		const browser = await browserType.launch({ headless: true });
		try {
			const page = await browser.newPage();
			await page.setContent("<!doctype html><html><body></body></html>");
			await page.addScriptTag({ path: outputPath });
			const report = await page.evaluate(async () => {
				return globalThis.FinalStreamInterfaceBrowser.runBrowserConsumer();
			});
			results.push({ name, report });
		} finally {
			await browser.close();
		}
	}
	console.log(JSON.stringify(results));
} finally {
	await rm(temporaryDirectory, { force: true, recursive: true });
}
