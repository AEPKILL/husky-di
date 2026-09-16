/**
 * @overview Keeps the shared service catalog and experiment state mounted across DevTools navigation.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { LAB_MEMBERS, LAB_SERVICE_NAMES } from "@/consts/lab-services.const";
import {
	LabCustomActionEnum,
	LabCustomFailureEnum,
	LabCustomScopeEnum,
} from "@/enums/lab-custom-services.enum";
import type {
	LabCustomCommand,
	LabCustomCommandResult,
	LabCustomSnapshot,
} from "@/types/lab-custom-services.type";
import type { LabServerSnapshot } from "@/types/lab-server.type";
import { CustomServicesPanel } from "@/web/components/devtools/custom-services-panel";
import { RecordProperty } from "@/web/components/devtools/record-property";
import { Button } from "@/web/components/ui/button";
import type {
	DevtoolsView,
	RenderDevtoolsOptions,
} from "@/web/types/devtools.type";

export function ServicesPanel(
	props: RenderDevtoolsOptions & {
		readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
	},
) {
	const [experiment, setExperiment] = useState(false);
	const [observedNode, setNode] = useState<LabCustomSnapshot>();
	const [observedBrowser, setBrowser] = useState<LabCustomSnapshot>();
	const [stale, setStale] = useState(false);
	const [uncertain, setUncertain] = useState<string[]>([]);
	const [feedback, setFeedback] = useState("");
	const runtime = props.browserCustomServices;
	const node = selectNodeSnapshot(props.server, observedNode);
	const browser = runtime?.snapshot() ?? observedBrowser;
	const latest = useRef({ server: props.server, node });
	latest.current = { server: props.server, node };
	const acceptNode = useCallback((snapshot: LabCustomSnapshot) => {
		const current = latest.current;
		if (current.server && snapshot.instanceId !== current.server.instanceId)
			return false;
		if (
			current.node?.instanceId === snapshot.instanceId &&
			current.node.observation > snapshot.observation
		)
			return false;
		latest.current = { ...current, node: snapshot };
		setNode(snapshot);
		setStale(false);
		return true;
	}, []);
	useEffect(() => {
		let disposed = false;
		let timer: ReturnType<typeof setTimeout>;
		const controller = new AbortController();
		const poll = async () => {
			if (runtime) setBrowser(runtime.snapshot());
			if (!props.nodePollingStopped) {
				try {
					const response = await fetch("/api/custom", {
						signal: controller.signal,
					});
					if (!response.ok) throw new Error("observation failed");
					const snapshot = (await response.json()) as LabCustomSnapshot;
					if (!disposed) acceptNode(snapshot);
				} catch {
					if (!disposed) setStale(true);
				}
			}
			if (!disposed) timer = setTimeout(() => void poll(), 500);
		};
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
			controller.abort();
		};
	}, [runtime, props.nodePollingStopped, acceptNode]);
	const apply = (result: LabCustomCommandResult, local: boolean) => {
		if (local) setBrowser(result.snapshot);
		else acceptNode(result.snapshot);
		setFeedback(
			result.ok
				? `${result.requestId} · confirmed`
				: result.error === LabCustomFailureEnum.validation
					? "Form/JSON validation failed · validation · RPC not called"
					: result.error === LabCustomFailureEnum.staleRevision
						? "Management failed · stale-revision · load the latest definition and edit again"
						: `Management failed · ${result.error}`,
		);
	};
	const execute = async (
		command: LabCustomCommand,
		local: boolean,
	): Promise<LabCustomCommandResult | undefined> => {
		if (local) {
			if (!runtime) return undefined;
			const result = runtime.execute(command);
			apply(result, true);
			if (
				result.ok &&
				props.server &&
				props.peerId &&
				command.action !== LabCustomActionEnum.call &&
				command.action !== LabCustomActionEnum.cancel
			) {
				const advertise: LabCustomCommand = {
					instanceId: props.server.instanceId,
					requestId: crypto.randomUUID(),
					action: LabCustomActionEnum.advertise,
					catalog: {
						target: {
							scope: LabCustomScopeEnum.browserPeer,
							instanceId: props.server.instanceId,
							peerId: props.peerId,
						},
						definitions: result.snapshot.definitions
							.filter(
								(definition) =>
									definition.target.instanceId === props.server?.instanceId &&
									definition.target.peerId === props.peerId,
							)
							.map((definition) => ({
								id: definition.id,
								revision: definition.revision,
								wireName: definition.wireName,
								exposed: definition.exposed,
								methods: definition.methods.map(({ name, cancelable }) => ({
									name,
									cancelable,
								})),
							})),
					},
				};
				const advertised = await execute(advertise, false);
				if (!advertised?.ok)
					setFeedback(
						`This page operation is confirmed; Node catalog ${advertised ? `Management failed · ${advertised.error}` : "Result pending verification"}`,
					);
			}
			return result;
		}
		try {
			const response = await fetch("/api/custom", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(command),
			});
			const result = (await response.json()) as LabCustomCommandResult;
			if (
				result.requestId !== command.requestId ||
				typeof result.ok !== "boolean" ||
				!result.snapshot
			)
				throw new Error("missing operation evidence");
			if (
				latest.current.server &&
				result.snapshot.instanceId !== latest.current.server.instanceId
			) {
				setFeedback(
					"Old Node management response is stale; it is not current instance state.",
				);
				return undefined;
			}
			apply(result, false);
			return result;
		} catch {
			setUncertain((previous) => [...previous, command.requestId]);
			setFeedback(
				"Management result pending verification; keeping the last observation state without resending.",
			);
			return undefined;
		}
	};
	const refresh = async () => {
		try {
			const response = await fetch("/api/custom");
			if (!response.ok) throw new Error("observation failed");
			const snapshot = (await response.json()) as LabCustomSnapshot;
			acceptNode(snapshot);
			for (const requestId of uncertain) {
				const operation = await fetch(
					`/api/custom/operations/${encodeURIComponent(requestId)}`,
				);
				if (!operation.ok) continue;
				const result = (await operation.json()) as LabCustomCommandResult;
				if (
					result.requestId === requestId &&
					typeof result.ok === "boolean" &&
					(!latest.current.server ||
						result.snapshot.instanceId === latest.current.server.instanceId)
				) {
					setUncertain((previous) => previous.filter((id) => id !== requestId));
					setFeedback(
						result.ok
							? "Refresh confirmed the operation took effect"
							: `Refresh confirmed management failure · ${result.error}`,
					);
				}
			}
		} catch {
			setStale(true);
		}
	};
	return (
		<div className="services-panel">
			<fieldset className="custom-actions" aria-label="Services View">
				<Button
					variant="ghost"
					aria-pressed={!experiment}
					onClick={() => setExperiment(false)}
				>
					Service Catalog
				</Button>
				<Button
					variant="ghost"
					aria-pressed={experiment}
					onClick={() => setExperiment(true)}
				>
					Custom Experiment
				</Button>
				<Button variant="ghost" onClick={() => void refresh()}>
					Refresh Service State
				</Button>
			</fieldset>
			<p className="inspector-note" role="status">
				{props.nodePollingStopped
					? "Node ObservationStopped"
					: stale
						? "/api/custom observation failed · showing last confirmed observation"
						: "Last Node observation"}
				:
				{node
					? `${new Date(node.observedAt).toISOString()} · Node local observation #${node.observation}`
					: "Unknown"}
				. {feedback}
			</p>
			{uncertain.length ? (
				<p className="custom-warning" role="status">
					Result pending verification: {uncertain.join(", ")}. It remains
					unconfirmed when refresh has no evidence.
				</p>
			) : null}
			<div hidden={experiment}>
				<h3>Explicit Descriptor / Method allowlist</h3>
				{[
					[
						LAB_SERVICE_NAMES.lab,
						Object.keys(LAB_MEMBERS).join(", "),
						"Node Peer · lab control",
						"declared",
					],
					[
						"example.shipping.v1",
						"quote",
						"Acceptor · revocable",
						props.server?.globalExposure ? "exposed" : "revoked / unavailable",
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
						<small>{status} · built-in read-only</small>
					</div>
				))}
				{(props.server?.peers ?? []).map((peer) => (
					<RecordProperty
						key={peer.id}
						name={`${peer.id} / example.peer-lab.v1.inspect`}
						value={
							peer.peerExposure
								? "exposed to this Peer"
								: "revoked for this Peer"
						}
					/>
				))}
				<h3>Lab Custom Service Definitions</h3>
				{[...(node?.definitions ?? []), ...(browser?.definitions ?? [])].map(
					(definition) => (
						<div className="service-row" key={definition.id}>
							<strong className="mono">{definition.wireName}</strong>
							<span>
								{definition.methods
									.map(
										(method) =>
											`${method.name}${method.cancelable ? " (cancelable)" : ""}`,
									)
									.join(", ")}
							</span>
							<small>
								{definition.target.scope} ·{" "}
								{definition.target.peerId ?? "acceptor"} · revision{" "}
								{definition.revision}
							</small>
							<small>
								{definition.exposed ? "exposed" : "saved / unexposed"} ·{" "}
								{definition.targetValid ? "Target valid" : "Target invalid"}
							</small>
						</div>
					),
				)}
				{node?.catalogs
					.filter((catalog) => catalog.target.peerId !== props.peerId)
					.flatMap((catalog) =>
						catalog.definitions.map((definition) => (
							<div
								className="service-row"
								key={`${catalog.target.peerId}:${definition.id}`}
							>
								<strong className="mono">{definition.wireName}</strong>
								<span>
									{definition.methods.map((method) => method.name).join(", ")}
								</span>
								<small>
									Browser · {catalog.target.peerId} · target page config
								</small>
								<small>
									{definition.exposed ? "exposed" : "saved / unexposed"}
								</small>
							</div>
						)),
					)}
				<p className="inspector-note">
					Catalog comes from Lab definition and exposure cleanup tracking, not
					remote reflection; saved or exposed does not guarantee it is currently
					callable.
				</p>
			</div>
			<div hidden={!experiment}>
				<CustomServicesPanel
					{...props}
					node={node}
					browser={browser}
					execute={execute}
				/>
			</div>
		</div>
	);
}

function selectNodeSnapshot(
	server: LabServerSnapshot | undefined,
	snapshot: LabCustomSnapshot | undefined,
): LabCustomSnapshot | undefined {
	if (server && snapshot?.instanceId !== server.instanceId)
		return server.custom;
	if (!server?.custom) return snapshot;
	return snapshot && snapshot.observation > server.custom.observation
		? snapshot
		: server.custom;
}
