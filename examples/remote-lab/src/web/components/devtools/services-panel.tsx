/**
 * @overview Shows declared service methods and example-owned exposure state.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { LAB_METHODS, LAB_SERVICE_NAMES } from "@/consts/lab-services.const";
import type { LabServerSnapshot } from "@/types/lab-server.type";
import { RecordProperty } from "@/web/components/devtools/record-property";

export function ServicesPanel({
	server,
}: {
	readonly server: LabServerSnapshot | undefined;
}) {
	return (
		<div className="services-panel">
			<h3>显式 Descriptor / 方法白名单</h3>
			{[
				[
					LAB_SERVICE_NAMES.lab,
					Object.keys(LAB_METHODS).join(", "),
					"Node Peer · lab control",
					"declared",
				],
				[
					"example.shipping.v1",
					"quote",
					"Acceptor · revocable",
					server?.globalExposure ? "exposed" : "revoked / unavailable",
				],
				["example.greeting.v1", "greet, ready", "Node Peer", "declared"],
				["example.lab-browser.v1", "receive", "Browser Peer", "declared"],
				[
					"example.browser-display.v1",
					"showMessage",
					"Browser Peer",
					"declared",
				],
			].map(([name, methods, scope, status]) => (
				<div className="service-row" key={name}>
					<strong className="mono">{name}</strong>
					<span className="mono">{methods}</span>
					<small>{scope}</small>
					<small>{status}</small>
				</div>
			))}
			{(server?.peers ?? []).map((peer) => (
				<RecordProperty
					key={peer.id}
					name={`${peer.id} / example.peer-lab.v1.inspect`}
					value={
						peer.peerExposure ? "exposed to this Peer" : "revoked for this Peer"
					}
				/>
			))}
			<p className="inspector-note">
				Descriptor 信息来自共享合约；撤销状态来自示例
				/api/lab。不是远端注册表反射。全局与 Peer 同名暴露会冲突，不覆盖。
			</p>
		</div>
	);
}
