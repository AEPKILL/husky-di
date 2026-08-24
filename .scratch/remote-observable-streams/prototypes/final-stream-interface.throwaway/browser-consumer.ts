/**
 * @overview DOM-only proposed-fixture browser consumer. The runtime bundle is
 * exercised in Chromium, Firefox, and WebKit without Node globals.
 *
 * @author AEPKILL
 * @created 2026-08-23 00:00:00
 */

import { runFinalStreamInterfacePrototype } from "./final-stream-interface.prototype.ts";

export async function runBrowserConsumer(): Promise<
	Readonly<{
		consumer: "browser-dom-proposed-fixture";
		domProbe: "passed";
		report: Awaited<ReturnType<typeof runFinalStreamInterfacePrototype>>;
	}>
> {
	const marker = document.createElement("output");
	marker.dataset.prototype = "final-stream-interface";
	document.body.append(marker);
	const report = await runFinalStreamInterfacePrototype();
	if (report.productionAcceptance !== "negative-baseline-not-claimed") {
		throw new Error("browser fixture lost the production handoff boundary");
	}
	return Object.freeze({
		consumer: "browser-dom-proposed-fixture",
		domProbe: "passed",
		report,
	});
}
