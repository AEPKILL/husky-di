/**
 * @overview CancelScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function CancelScenario({
	texts,
	scenario,
	unavailable,
	reportBusy,
	reportCancelable,
	reportResumable,
	onAction,
}: Pick<
	WorkbenchProps,
	| "texts"
	| "scenario"
	| "unavailable"
	| "reportBusy"
	| "reportCancelable"
	| "reportResumable"
	| "onAction"
>) {
	return (
		<section data-scene="cancel" hidden={scenario !== "cancel"}>
			<div className="eyebrow">02 / CANCELLATION & COOPERATIVE DEBUGGING</div>
			<h1>Pause business work while lifecycles continue.</h1>
			<p className="intro">
				The report handler supports cooperative pause. Cancellation only ends
				caller waiting; it does not roll back work that already happened.
			</p>
			<div className="inline-form">
				<label>
					Processing Time / ms
					<input
						id="report-delay"
						type="number"
						min="0"
						max="10000"
						defaultValue="3000"
					/>
				</label>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-start"
					data-needs-peer
					className="primary"
					disabled={unavailable || reportBusy}
				>
					Start Long Task
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-timeout"
					data-needs-peer
					disabled={unavailable || reportBusy}
				>
					500 ms App Timeout
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-pause"
					data-needs-peer
					disabled={unavailable || reportBusy}
				>
					Start and Pause
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-cancel"
					disabled={!reportCancelable}
				>
					Cancel Wait
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="report-resume"
					data-needs-peer
					disabled={!reportResumable}
				>
					▶ Continue Handler
				</Button>
			</div>
			<p id="report-result" className="scenario-result" role="status">
				{texts["#report-result"] ??
					"After starting, inspect Network call results and Sources business state."}
			</p>
		</section>
	);
}
