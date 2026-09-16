/**
 * @overview ErrorsScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function ErrorsScenario({
	texts,
	scenario,
	unavailable,
	onAction,
}: Pick<WorkbenchProps, "texts" | "scenario" | "unavailable" | "onAction">) {
	return (
		<section data-scene="errors" hidden={scenario !== "errors"}>
			<div className="eyebrow">07 / ERROR BOUNDARIES</div>
			<h1>Failures have boundaries and results need evidence.</h1>
			<p className="intro">
				Compare real handler-failed, unknown-service, and unknown-method. Remote
				error messages and stacks do not enter safe RPC events.
			</p>
			<div className="actions">
				<Button
					onClick={onAction}
					variant="outline"
					id="handler-fail"
					data-needs-peer
					className="primary"
					disabled={unavailable}
				>
					Handler Throws
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="unknown-service"
					data-needs-peer
					disabled={unavailable}
				>
					Unknown service
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					id="unknown-method"
					data-needs-peer
					disabled={unavailable}
				>
					Unknown method
				</Button>
			</div>
			<p id="error-result" className="scenario-result" role="status">
				{texts["#error-result"] ??
					"Errors terminate only the corresponding call; connection state is shown independently."}
			</p>
		</section>
	);
}
