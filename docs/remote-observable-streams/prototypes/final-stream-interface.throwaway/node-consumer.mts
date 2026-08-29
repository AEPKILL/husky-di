/**
 * @overview Proposed-fixture Node ESM consumer. This does not import the
 * current production package and therefore is not a production acceptance
 * claim.
 *
 * @author AEPKILL
 * @created 2026-08-23 00:00:00
 */

import {
	CURRENT_PRODUCTION_NEGATIVE_BASELINE,
	runFinalStreamInterfacePrototype,
} from "./final-stream-interface.prototype.ts";

const report = await runFinalStreamInterfacePrototype();

if (
	report.prototypeResult !== "passed" ||
	report.productionAcceptance !== "negative-baseline-not-claimed"
) {
	throw new Error(
		"proposed Node ESM fixture did not preserve its handoff boundary",
	);
}

console.log(
	JSON.stringify({
		consumer: "node-esm-proposed-fixture",
		currentProductionNegativeBaseline: CURRENT_PRODUCTION_NEGATIVE_BASELINE,
		report,
	}),
);
