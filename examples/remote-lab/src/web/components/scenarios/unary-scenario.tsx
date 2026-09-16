/**
 * @overview UnaryScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function UnaryScenario({
	texts,
	scenario,
	unavailable,
	greetings,
	onAction,
	onSubmit,
}: Pick<
	WorkbenchProps,
	"texts" | "scenario" | "unavailable" | "greetings" | "onAction" | "onSubmit"
>) {
	return (
		<section data-scene="unary" hidden={scenario !== "unary"}>
			<div className="eyebrow">01 / BIDIRECTIONAL RPC</div>
			<h1>
				Call the method above,
				<br className="mobile-break" />
				then watch what happens below.
			</h1>
			<p className="intro">
				One business operation links the call network, data flow, handler pause
				point, and console.
			</p>
			<div className="business-grid">
				<form onSubmit={onSubmit} id="quote-form" className="inline-form">
					<label>
						Origin
						<input id="from" defaultValue="Shanghai" maxLength={80} required />
					</label>
					<label>
						Destination
						<input id="to" defaultValue="Hangzhou" maxLength={80} required />
					</label>
					<label>
						Weight / kg
						<input
							id="weight"
							type="number"
							min="0.1"
							max="100"
							step="0.1"
							defaultValue="2.5"
							required
						/>
					</label>
					<Button
						onClick={onAction}
						variant="outline"
						className="primary"
						data-needs-peer
						type="submit"
						disabled={unavailable}
					>
						Run quote
					</Button>
				</form>
				<div className="quote-result">
					<small>shipping.quote · sample freight</small>
					<strong id="quote-result">{texts["#quote-result"] ?? "¥ —"}</strong>
					<small>real return value → Network / Payload</small>
				</div>
			</div>
			<details className="greeting-details">
				<summary>Concurrent greeting and Node to Browser callback</summary>
				<form onSubmit={onSubmit} id="greeting-form" className="inline-form">
					<label>
						Name
						<input id="name" defaultValue="Ada" maxLength={80} required />
					</label>
					<label>
						Delay / ms
						<input
							id="delay"
							type="number"
							min="0"
							max="10000"
							step="100"
							defaultValue="1500"
							required
						/>
					</label>
					<Button
						onClick={onAction}
						variant="outline"
						data-needs-peer
						type="submit"
						disabled={unavailable}
					>
						Send greeting
					</Button>
					<Button
						onClick={onAction}
						variant="outline"
						data-needs-peer
						id="burst"
						type="button"
						disabled={unavailable}
					>
						Send 3 together
					</Button>
				</form>
				<div className="callback">
					<span>Node → Browser</span>
					<strong id="callback" aria-live="polite">
						{texts["#callback"] ?? "Waiting for reverse call..."}
					</strong>
				</div>
				<ol id="results" className="result-list" aria-live="polite">
					{greetings.map((greeting) => (
						<li key={greeting.id}>{greeting.text}</li>
					))}
				</ol>
			</details>
		</section>
	);
}
