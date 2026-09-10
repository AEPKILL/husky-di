/**
 * @overview BusinessWorkspace for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { AdapterScenario } from "@/web/components/scenarios/adapter-scenario";
import { CancelScenario } from "@/web/components/scenarios/cancel-scenario";
import { ErrorsScenario } from "@/web/components/scenarios/errors-scenario";
import { ExposureScenario } from "@/web/components/scenarios/exposure-scenario";
import { PeersScenario } from "@/web/components/scenarios/peers-scenario";
import { RecoveryScenario } from "@/web/components/scenarios/recovery-scenario";
import { ShutdownScenario } from "@/web/components/scenarios/shutdown-scenario";
import { UnaryScenario } from "@/web/components/scenarios/unary-scenario";
import { ValuesScenario } from "@/web/components/scenarios/values-scenario";
import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function BusinessWorkspace({
	texts,
	scenario,
	peerId,
	unavailable,
	reportBusy,
	reportCancelable,
	reportResumable,
	capacityPending,
	greetings,
	onAction,
	onSubmit,
	server,
	transportSummary,
}: Pick<
	WorkbenchProps,
	| "texts"
	| "scenario"
	| "peerId"
	| "unavailable"
	| "reportBusy"
	| "reportCancelable"
	| "reportResumable"
	| "capacityPending"
	| "greetings"
	| "onAction"
	| "onSubmit"
> & { readonly server: WorkbenchProps["devtools"]["server"] } & {
	readonly transportSummary: string;
}) {
	return (
		<div className="workspace">
			<nav className="scenarios" aria-label="能力场景">
				<small>EXPLORE / 09</small>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="unary"
					aria-pressed={scenario === "unary"}
				>
					<span>01</span>双向调用
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="cancel"
					aria-pressed={scenario === "cancel"}
				>
					<span>02</span>取消与调试
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="recovery"
					aria-pressed={scenario === "recovery"}
				>
					<span>03</span>断线与恢复
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="peers"
					aria-pressed={scenario === "peers"}
				>
					<span>04</span>多 Peer 调度
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="exposure"
					aria-pressed={scenario === "exposure"}
				>
					<span>05</span>暴露与撤销
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="values"
					aria-pressed={scenario === "values"}
				>
					<span>06</span>值模型与边界
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="errors"
					aria-pressed={scenario === "errors"}
				>
					<span>07</span>错误与观测
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="shutdown"
					aria-pressed={scenario === "shutdown"}
				>
					<span>08</span>关闭与资源
				</Button>
				<Button
					onClick={onAction}
					variant="outline"
					data-scenario="adapter"
					aria-pressed={scenario === "adapter"}
				>
					<span>09</span>Adapter 与合规
				</Button>
				<div className="sidebar-note">
					真实 WebSocket
					<br />
					双向 unary RPC
					<br />
					<span className="live-dot"></span> application instrumentation
				</div>
			</nav>
			<div className="business">
				<UnaryScenario
					texts={texts}
					scenario={scenario}
					unavailable={unavailable}
					greetings={greetings}
					onAction={onAction}
					onSubmit={onSubmit}
				/>
				<CancelScenario
					texts={texts}
					scenario={scenario}
					unavailable={unavailable}
					reportBusy={reportBusy}
					reportCancelable={reportCancelable}
					reportResumable={reportResumable}
					onAction={onAction}
				/>
				<RecoveryScenario
					texts={texts}
					scenario={scenario}
					peerId={peerId}
					unavailable={unavailable}
					reportBusy={reportBusy}
					onAction={onAction}
					server={server}
				/>
				<PeersScenario
					texts={texts}
					scenario={scenario}
					peerId={peerId}
					unavailable={unavailable}
					onAction={onAction}
					server={server}
				/>
				<ExposureScenario
					texts={texts}
					scenario={scenario}
					unavailable={unavailable}
					onAction={onAction}
					server={server}
				/>
				<ValuesScenario
					texts={texts}
					scenario={scenario}
					unavailable={unavailable}
					onAction={onAction}
				/>
				<ErrorsScenario
					texts={texts}
					scenario={scenario}
					unavailable={unavailable}
					onAction={onAction}
				/>
				<ShutdownScenario
					texts={texts}
					scenario={scenario}
					unavailable={unavailable}
					capacityPending={capacityPending}
					onAction={onAction}
				/>
				<AdapterScenario
					scenario={scenario}
					transportSummary={transportSummary}
				/>
				<div className="notice-row">
					<span id="notice" role="status">
						{texts["#notice"] ?? "正在连接本地 Node 服务…"}
					</span>
					<span className="muted">
						Supervisor:{" "}
						<span id="supervisor">{texts["#supervisor"] ?? "idle"}</span>
					</span>
				</div>
			</div>
		</div>
	);
}
