/**
 * @overview ValuesScenario for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
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
			<h1>只让明确的数据穿过边界。</h1>
			<p className="intro">
				合法值经 echo 往返。非法值由 Remote 拒绝；APP 记录不等于已创建 RPC
				调用。
			</p>
			<div className="inline-form">
				<label className="wide-field">
					JSON 数据
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
					echo 合法 JSON
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
					嵌套 undefined
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-value="cycle"
					data-needs-peer
					disabled={unavailable}
				>
					循环引用
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-value="large"
					data-needs-peer
					disabled={unavailable}
				>
					2 MiB 字符串
				</Button>
			</div>
			<p id="value-result" className="scenario-result" role="status">
				{texts["#value-result"] ?? "参数与结果由示例显式采集，摘要有界。"}
			</p>
		</section>
	);
}
