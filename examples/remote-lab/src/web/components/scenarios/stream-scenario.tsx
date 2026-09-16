/**
 * @overview Observable stream lifecycle experiment for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-13 23:08:57
 */

import {
	LabStreamKindEnum,
	LabStreamStatusEnum,
} from "@/enums/lab-stream.enum";
import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function StreamScenario({
	stream,
	scenario,
	onAction,
}: Pick<WorkbenchProps, "stream" | "scenario" | "onAction">) {
	return (
		<section data-scene="stream" hidden={scenario !== "stream"}>
			<div className="eyebrow">10 / OBSERVABLE STREAMS</div>
			<h1>One subscription, one independent stream.</h1>
			<p className="intro">
				This is an explicit RxJS stream experiment: method streams execute
				independently, the static source connects only on the first
				subscription, and unsubscribe sends stream-cancel without faking
				complete/error. All lifecycle events are mirrored in Network STREAM
				records.
			</p>
			<fieldset className="stream-toolbar">
				<legend className="sr-only">Observable stream controls</legend>
				<Button onClick={onAction} variant="outline" id="stream-method">
					Subscribe Method Stream
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-static">
					Subscribe Static Property
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-next">
					Source emits next
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-complete">
					Source emits complete
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-error">
					Source emits error
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-unsubscribe">
					Unsubscribe Latest
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-disconnect">
					Simulate Disconnect
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-recover">
					Recover and Replay
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-overflow">
					Exceed Cache Limit
				</Button>
				<Button onClick={onAction} variant="outline" id="stream-reset">
					Reset Experiment
				</Button>
			</fieldset>
			<section className="stream-state" aria-label="stream state">
				<span>
					Connection{" "}
					<strong>{stream.connected ? "connected" : "disconnected"}</strong>
				</span>
				<span>
					Open Subscriptions{" "}
					<strong>
						{
							stream.streams.filter(
								(item) => item.status === LabStreamStatusEnum.open,
							).length
						}
					</strong>
				</span>
				<span>
					Static Source{" "}
					<strong>
						{stream.staticSource} ({stream.staticSubscribers})
					</strong>
				</span>
				<span>
					retained{" "}
					<strong>
						{stream.retained} / {stream.maxRetained}
					</strong>
				</span>
			</section>
			<div className="stream-grid">
				<div className="stream-cards" aria-live="polite">
					{stream.streams.length === 0 ? (
						<p className="help">
							No subscriptions yet. Choose a method stream or static property to
							start.
						</p>
					) : (
						stream.streams.map((item) => (
							<article
								className="stream-card"
								data-stream-id={item.id}
								key={item.id}
							>
								<header>
									<strong>stream-{item.id}</strong>
									<span data-stream-status={item.status}>{item.status}</span>
								</header>
								<small>
									{item.kind === LabStreamKindEnum.static
										? "static observable"
										: "observable-function"}
								</small>
								<div>values: {item.values.join(", ") || "—"}</div>
								<div>
									terminal: {item.terminal} · retained: {item.retained}
								</div>
							</article>
						))
					)}
				</div>
				<pre className="stream-log" role="log" aria-label="stream event log">
					{stream.logs.join("\n")}
				</pre>
			</div>
		</section>
	);
}
