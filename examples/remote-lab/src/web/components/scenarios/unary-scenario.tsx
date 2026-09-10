/**
 * @overview UnaryScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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
				调用上面的方法，
				<br className="mobile-break" />
				观察下面发生了什么。
			</h1>
			<p className="intro">
				一个业务操作，联动调用网络、数据流、处理器暂停点和控制台。
			</p>
			<div className="business-grid">
				<form onSubmit={onSubmit} id="quote-form" className="inline-form">
					<label>
						起点
						<input id="from" defaultValue="上海" maxLength={80} required />
					</label>
					<label>
						终点
						<input id="to" defaultValue="杭州" maxLength={80} required />
					</label>
					<label>
						重量 / kg
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
						执行 quote →
					</Button>
				</form>
				<div className="quote-result">
					<small>shipping.quote · 示例运费</small>
					<strong id="quote-result">{texts["#quote-result"] ?? "¥ —"}</strong>
					<small>真实返回值 → Network / Payload</small>
				</div>
			</div>
			<details className="greeting-details">
				<summary>并发 greeting & Node → Browser 回调</summary>
				<form onSubmit={onSubmit} id="greeting-form" className="inline-form">
					<label>
						Name
						<input id="name" defaultValue="Ada" maxLength={80} required />
					</label>
					<label>
						延迟 / ms
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
						{texts["#callback"] ?? "等待反向调用…"}
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
