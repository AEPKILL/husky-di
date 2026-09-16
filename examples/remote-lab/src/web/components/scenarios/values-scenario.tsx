/**
 * @overview ValuesScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function ValuesScenario({
	texts,
	scenario,
	unavailable,
	onAction,
}: Pick<WorkbenchProps, "texts" | "scenario" | "unavailable" | "onAction">) {
	return (
		<section data-scene="values" hidden={scenario !== "values"}>
			<div className="eyebrow">06 / APPLICATION VALUE BOUNDARY</div>
			<h1>Only explicit data crosses the boundary.</h1>
			<p className="intro">
				Valid values round-trip through echo. Remote rejects invalid values; an
				APP record does not mean an RPC call was created.
			</p>
			<div className="inline-form">
				<label className="wide-field">
					JSON Data
					<textarea
						id="value-json"
						rows={2}
						spellCheck="false"
						defaultValue={'{"message":"hello","items":[1,true,null]}'}
					></textarea>
				</label>
				<Button
					onClick={onAction}
					variant="outline"
					id="value-valid"
					data-needs-peer
					className="primary"
					disabled={unavailable}
				>
					Echo valid JSON
				</Button>
			</div>
			<div className="actions">
				<Button
					onClick={onAction}
					variant="outline"
					data-value="date"
					data-needs-peer
					disabled={unavailable}
				>
					Date
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-value="undefined"
					data-needs-peer
					disabled={unavailable}
				>
					Nested undefined
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-value="cycle"
					data-needs-peer
					disabled={unavailable}
				>
					Circular reference
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-value="large"
					data-needs-peer
					disabled={unavailable}
				>
					2 MiB string
				</Button>
			</div>
			<p id="value-result" className="scenario-result" role="status">
				{texts["#value-result"] ??
					"Arguments and results are explicitly captured by the example with bounded summaries."}
			</p>
		</section>
	);
}
