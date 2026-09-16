/**
 * @overview Edits exact custom definitions and invokes retained Remote Facades with explicit result navigation.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { useState } from "react";
import {
	LabCustomActionEnum,
	LabCustomBehaviorEnum,
	LabCustomScopeEnum,
} from "@/enums/lab-custom-services.enum";
import type {
	LabCustomCall,
	LabCustomCommand,
	LabCustomCommandResult,
	LabCustomFacadeInput,
	LabCustomMethod,
	LabCustomSnapshot,
	LabCustomTarget,
} from "@/types/lab-custom-services.type";
import { Button } from "@/web/components/ui/button";
import {
	DevtoolsDetailEnum,
	DevtoolsNetworkViewEnum,
	DevtoolsPanelEnum,
} from "@/web/enums/devtools.enum";
import type {
	DevtoolsView,
	RenderDevtoolsOptions,
} from "@/web/types/devtools.type";
import { formatDevtoolsJson } from "@/web/utils/format-devtools-json.util";
import { getCallRecordKey } from "@/web/utils/get-call-record-key.util";

export function CustomServicesPanel(
	props: RenderDevtoolsOptions & {
		readonly node: LabCustomSnapshot | undefined;
		readonly browser: LabCustomSnapshot | undefined;
		readonly execute: (
			command: LabCustomCommand,
			local: boolean,
		) => Promise<LabCustomCommandResult | undefined>;
		readonly onViewChange: (patch: Partial<DevtoolsView>) => void;
	},
) {
	const [draft, setDraft] = useState<DefinitionDraft>(() => newDraft());
	const [sourceId, setSourceId] = useState("");
	const [callPeer, setCallPeer] = useState("");
	const [facadeKey, setFacadeKey] = useState("");
	const [method, setMethod] = useState("");
	const [argsJson, setArgsJson] = useState("[]");
	const [formError, setFormError] = useState("");
	const [nodeDetail, setNodeDetail] = useState<string>();
	const definitions = [
		...(props.node?.definitions ?? []),
		...(props.browser?.definitions ?? []),
	];
	const selected = definitions.find((definition) => definition.id === draft.id);
	const sources: (LabCustomFacadeInput & { id: string })[] = [
		...definitions,
		...(props.node?.catalogs
			.filter((catalog) => catalog.target.peerId !== props.peerId)
			.flatMap((catalog) =>
				catalog.definitions.map((definition) => ({
					...definition,
					target: catalog.target,
				})),
			) ?? []),
	];
	const source = sources.find((entry) => sourceKey(entry) === sourceId);
	const facades = [
		...(props.browser?.facades.map((facade) => ({ facade, local: true })) ??
			[]),
		...(props.node?.facades.map((facade) => ({ facade, local: false })) ?? []),
	];
	const chosenFacade = facades.find(
		({ facade, local }) => `${local}:${facade.id}` === facadeKey,
	);
	const calls = [
		...(props.browser?.calls.map((call) => ({ call, local: true })) ?? []),
		...(props.node?.calls.map((call) => ({ call, local: false })) ?? []),
	].sort((left, right) => right.call.startedAt - left.call.startedAt);
	const own = draft.scope === LabCustomScopeEnum.browserPeer;
	const commandBase = (local: boolean) => ({
		instanceId: (local ? props.browser : props.node)?.instanceId ?? "",
		requestId: crypto.randomUUID(),
	});
	const target = (): LabCustomTarget => ({
		scope: draft.scope,
		instanceId: props.server?.instanceId ?? "",
		...(draft.scope === LabCustomScopeEnum.nodeGlobal
			? {}
			: { peerId: own ? props.peerId : draft.peerId || props.peerId }),
	});
	const selectDefinition = (id: string) => {
		const definition = definitions.find((entry) => entry.id === id);
		setDraft(
			definition
				? {
						id: definition.id,
						revision: definition.revision,
						instanceId: definition.target.instanceId,
						scope: definition.target.scope,
						peerId: definition.target.peerId ?? "",
						wireName: definition.wireName,
						methods: definition.methods.map((entry) => ({
							...entry,
							delayMs: String(entry.delayMs),
							key: crypto.randomUUID(),
						})),
					}
				: newDraft(),
		);
		setFormError("");
	};
	const save = async () => {
		const invalid = validateDraft(draft);
		if (invalid) {
			setFormError(`Form failed · ${invalid} · RPC not called`);
			return;
		}
		setFormError("");
		const result = await props.execute(
			{
				...commandBase(own),
				action: LabCustomActionEnum.save,
				...(draft.id ? { id: draft.id, revision: draft.revision } : {}),
				definition: {
					target: target(),
					wireName: draft.wireName,
					methods: draft.methods.map(({ key: _key, ...entry }) => ({
						...entry,
						delayMs: Number(entry.delayMs),
					})),
				},
			},
			own,
		);
		if (result?.ok) {
			const definition = result.snapshot.definitions.find(
				(entry) => entry.id === result.id,
			);
			if (definition) {
				setDraft((previous) => ({
					...previous,
					copiedFrom: undefined,
					id: definition.id,
					revision: definition.revision,
					instanceId: definition.target.instanceId,
				}));
				setSourceId(sourceKey(definition));
				setCallPeer(definition.target.peerId ?? props.peerId ?? "");
			}
		}
	};
	const mutate = async (
		action:
			| LabCustomActionEnum.expose
			| LabCustomActionEnum.revoke
			| LabCustomActionEnum.remove,
	) => {
		if (!selected) return;
		const result = await props.execute(
			{
				...commandBase(own),
				action,
				id: selected.id,
				revision: draft.revision ?? selected.revision,
			},
			own,
		);
		if (result?.ok) {
			if (action === LabCustomActionEnum.remove) setDraft(newDraft());
			else
				setDraft((previous) => ({
					...previous,
					revision: result.snapshot.definitions.find(
						(entry) => entry.id === selected.id,
					)?.revision,
				}));
		}
	};
	const resolve = async () => {
		if (!source || !props.server) return;
		const local = source.target.scope !== LabCustomScopeEnum.browserPeer;
		const result = await props.execute(
			{
				...commandBase(local),
				action: LabCustomActionEnum.resolve,
				facade: {
					wireName: source.wireName,
					methods: source.methods,
					target: {
						scope: local
							? LabCustomScopeEnum.nodePeer
							: LabCustomScopeEnum.browserPeer,
						instanceId: source.target.instanceId,
						peerId: local ? props.peerId : callPeer || source.target.peerId,
					},
				},
			},
			local,
		);
		if (result?.ok && result.id) {
			setFacadeKey(`${local}:${result.id}`);
			setMethod(source.methods[0]?.name ?? "");
		}
	};
	const invoke = async () => {
		if (!chosenFacade) return;
		try {
			if (!Array.isArray(JSON.parse(argsJson))) throw new Error("not-array");
		} catch {
			setFormError("Arguments JSON must be an array · RPC not called");
			return;
		}
		setFormError("");
		await props.execute(
			{
				...commandBase(chosenFacade.local),
				action: LabCustomActionEnum.call,
				facadeId: chosenFacade.facade.id,
				method,
				argsJson,
			},
			chosenFacade.local,
		);
	};
	const openRecord = (call: LabCustomCall, local: boolean) => {
		if (
			!local &&
			(call.target.peerId !== props.peerId ||
				call.target.instanceId !== props.server?.instanceId)
		) {
			setNodeDetail(call.id);
			return;
		}
		const record = props.calls.find((entry) => entry.traceId === call.traceId);
		if (!record) {
			setFormError(
				"Record was cleared, evicted, or not yet observed; old records are not restored.",
			);
			return;
		}
		props.onViewChange({
			panel: DevtoolsPanelEnum.network,
			networkView: DevtoolsNetworkViewEnum.calls,
			selected: getCallRecordKey(record),
			detail: DevtoolsDetailEnum.payload,
			filter: "",
			side: "all",
			status: "all",
			returnToServices: true,
		});
	};
	const detail = calls.find(
		({ call, local }) => !local && call.id === nodeDetail,
	)?.call;
	return (
		<div className="custom-services-panel">
			<div hidden={nodeDetail !== undefined}>
				{formError ? (
					<p role="alert" className="custom-warning">
						{formError}
					</p>
				) : null}
				<div className="custom-grid">
					<section className="custom-card" aria-label="Definition Editor">
						<h3>1 · Save Definition and Exposure</h3>
						<label>
							Saved Definition
							<select
								aria-label="Saved Definition"
								value={draft.id ?? ""}
								onChange={(event) => selectDefinition(event.target.value)}
							>
								<option value="">New Definition</option>
								{definitions.map((definition) => (
									<option key={definition.id} value={definition.id}>
										{definition.wireName} · {definition.target.scope} ·{" "}
										{definition.id}
									</option>
								))}
							</select>
						</label>
						<div className="custom-actions">
							<Button
								variant="ghost"
								onClick={() => {
									setDraft(newDraft());
									setFormError("");
								}}
							>
								New Definition
							</Button>
							<Button
								variant="ghost"
								disabled={!draft.id}
								onClick={() => selectDefinition(draft.id ?? "")}
							>
								Load Latest Definition
							</Button>
						</div>
						<p className="inspector-note">
							Draft revision {draft.revision ?? "—"} · Current revision{" "}
							{selected?.revision ?? "—"} ·{" "}
							{selected?.exposed
								? "exposed · revoke before editing"
								: "saved / unexposed"}{" "}
							·{" "}
							{selected
								? selected.targetValid
									? "Target valid"
									: "Target invalid, can be rebound manually"
								: "Not saved yet"}
						</p>
						{draft.copiedFrom ? (
							<p className="inspector-note" role="status">
								Cross-end target will be saved as a new definition；the original
								remains and can be deleted after revocation.
							</p>
						) : null}
						<fieldset disabled={selected?.exposed}>
							<legend>Lab Service Definition</legend>
							<label>
								Exposure Target
								<select
									aria-label="Exposure Target"
									value={draft.scope}
									onChange={(event) => {
										const scope = event.target.value as LabCustomScopeEnum;
										const changesOwner =
											(scope === LabCustomScopeEnum.browserPeer) !== own;
										setDraft({
											...draft,
											scope,
											...(draft.id && changesOwner
												? {
														id: undefined,
														revision: undefined,
														copiedFrom: draft.id,
													}
												: {}),
										});
									}}
								>
									{[
										[LabCustomScopeEnum.nodeGlobal, "Node Acceptor global"],
										[LabCustomScopeEnum.nodePeer, "Node specific Peer"],
										[LabCustomScopeEnum.browserPeer, "This Browser Peer"],
									].map(([value, label]) => (
										<option key={value} value={value}>
											{label}
										</option>
									))}
								</select>
							</label>
							{draft.scope === LabCustomScopeEnum.nodePeer ? (
								<label>
									Definition Peer
									<select
										aria-label="Definition Peer"
										value={draft.peerId || props.peerId || ""}
										onChange={(event) =>
											setDraft({ ...draft, peerId: event.target.value })
										}
									>
										{(props.server?.peers ?? []).map((peer) => (
											<option key={peer.id} value={peer.id}>
												{peer.id}
												{peer.id === props.peerId ? " · this page" : ""}
											</option>
										))}
										{draft.peerId &&
										!props.server?.peers.some(
											(peer) => peer.id === draft.peerId,
										) ? (
											<option value={draft.peerId}>
												{draft.peerId} · invalid
											</option>
										) : null}
									</select>
								</label>
							) : null}
							<label>
								Wire Service Name
								<input
									aria-label="Wire Service Name"
									value={draft.wireName}
									onChange={(event) =>
										setDraft({ ...draft, wireName: event.target.value })
									}
								/>
							</label>
							{draft.methods.map((entry, index) => (
								<fieldset key={entry.key} className="custom-method">
									<legend>Method {index + 1}</legend>
									<label>
										Method Name
										<input
											aria-label={`Method ${index + 1} Name`}
											value={entry.name}
											onChange={(event) =>
												setDraft({
													...draft,
													methods: draft.methods.map((item) =>
														item === entry
															? { ...item, name: event.target.value }
															: item,
													),
												})
											}
										/>
									</label>
									<label>
										Behavior
										<select
											aria-label={`Method ${index + 1} Behavior`}
											value={entry.behavior}
											onChange={(event) =>
												setDraft({
													...draft,
													methods: draft.methods.map((item) =>
														item === entry
															? {
																	...item,
																	behavior: event.target
																		.value as LabCustomBehaviorEnum,
																}
															: item,
													),
												})
											}
										>
											<option value={LabCustomBehaviorEnum.fixed}>
												Fixed JSON Return
											</option>
											<option value={LabCustomBehaviorEnum.echo}>
												Echo Argument Array
											</option>
											<option value={LabCustomBehaviorEnum.throw}>Throw</option>
										</select>
									</label>
									{entry.behavior === LabCustomBehaviorEnum.fixed ? (
										<label>
											Fixed JSON
											<textarea
												aria-label={`Method ${index + 1} Fixed JSON`}
												value={entry.valueJson}
												onChange={(event) =>
													setDraft({
														...draft,
														methods: draft.methods.map((item) =>
															item === entry
																? { ...item, valueJson: event.target.value }
																: item,
														),
													})
												}
											/>
										</label>
									) : null}
									<label>
										Delay ms
										<input
											aria-label={`Method ${index + 1} Delay ms`}
											type="number"
											min="0"
											max="10000"
											step="1"
											value={entry.delayMs}
											onChange={(event) =>
												setDraft({
													...draft,
													methods: draft.methods.map((item) =>
														item === entry
															? { ...item, delayMs: event.target.value }
															: item,
													),
												})
											}
										/>
									</label>
									<label className="check">
										<input
											aria-label={`Method ${index + 1} Cancelable`}
											type="checkbox"
											checked={entry.cancelable}
											onChange={(event) =>
												setDraft({
													...draft,
													methods: draft.methods.map((item) =>
														item === entry
															? { ...item, cancelable: event.target.checked }
															: item,
													),
												})
											}
										/>
										Cancelable
									</label>
									<Button
										variant="ghost"
										onClick={() =>
											setDraft({
												...draft,
												methods: draft.methods.filter((item) => item !== entry),
											})
										}
									>
										Delete Method {index + 1}
									</Button>
								</fieldset>
							))}
							<Button
								variant="ghost"
								onClick={() =>
									setDraft({
										...draft,
										methods: [...draft.methods, newMethod()],
									})
								}
							>
								Add Method
							</Button>
						</fieldset>
						<div className="custom-actions">
							<Button
								disabled={
									selected?.exposed || !(own ? props.browser : props.node)
								}
								onClick={() => void save()}
							>
								{draft.copiedFrom ? "Save As Definition" : "Save Definition"}
							</Button>
							<Button
								disabled={!selected || selected.exposed}
								onClick={() => void mutate(LabCustomActionEnum.expose)}
							>
								Expose Service
							</Button>
							<Button
								disabled={!selected?.exposed}
								onClick={() => void mutate(LabCustomActionEnum.revoke)}
							>
								Revoke Exposure
							</Button>
							<Button
								disabled={!selected || selected.exposed}
								onClick={() => void mutate(LabCustomActionEnum.remove)}
							>
								Delete Definition
							</Button>
							<Button
								disabled={!(own ? props.browser : props.node)}
								onClick={() =>
									void props
										.execute(
											{
												...commandBase(own),
												action: LabCustomActionEnum.reset,
												target: target(),
												revision:
													(own ? props.browser : props.node)?.revision ?? -1,
											},
											own,
										)
										.then((result) => {
											if (result?.ok) setDraft(newDraft());
										})
								}
							>
								Reset custom services for this target
							</Button>
						</div>
						<p className="inspector-note">
							Reset scope：{draft.scope} · {target().peerId ?? "acceptor"} ·{" "}
							{target().instanceId || "Unknown"}。Definitions and local
							ServiceIdentifiers are independent from wire names; exact names
							are not trimmed. Reset does not clear history or revoke admitted
							calls.
						</p>
					</section>
					<section className="custom-card" aria-label="Facade and Call">
						<h3>2 · Resolve Remote Facade</h3>
						<label>
							Call Catalog
							<select
								aria-label="Call Catalog"
								value={sourceId}
								onChange={(event) => {
									setSourceId(event.target.value);
									const entry = sources.find(
										(item) => sourceKey(item) === event.target.value,
									);
									setCallPeer(entry?.target.peerId ?? props.peerId ?? "");
								}}
							>
								<option value="">Select Definition</option>
								{sources.map((entry) => (
									<option key={sourceKey(entry)} value={sourceKey(entry)}>
										{entry.wireName} · {entry.target.scope} ·{" "}
										{entry.target.peerId ?? "acceptor"} · {entry.id}
									</option>
								))}
							</select>
						</label>
						{source?.target.scope === LabCustomScopeEnum.browserPeer ? (
							<label>
								CallTarget Peer
								<select
									aria-label="CallTarget Peer"
									value={callPeer || source.target.peerId || ""}
									onChange={(event) => setCallPeer(event.target.value)}
								>
									{(props.server?.peers ?? []).map((peer) => (
										<option key={peer.id} value={peer.id}>
											{peer.id}
											{peer.id === props.peerId
												? " · this page"
												: " · another page"}
										</option>
									))}
								</select>
							</label>
						) : (
							<p className="inspector-note">
								Browser → Node · this page {props.peerId ?? "Unknown"}
							</p>
						)}
						<Button disabled={!source} onClick={() => void resolve()}>
							Resolve Facade
						</Button>
						<p className="inspector-note">
							Resolving only creates a local facade; it does not prove the
							remote endpoint is exposed. Switching definition or target does
							not rebind the retained facade.
						</p>
						<h3>3 · Use Retained Facade Call</h3>
						<label>
							Retained Facade
							<select
								aria-label="Retained Facade"
								value={facadeKey}
								onChange={(event) => {
									setFacadeKey(event.target.value);
									const chosen = facades.find(
										({ facade, local }) =>
											`${local}:${facade.id}` === event.target.value,
									);
									setMethod(chosen?.facade.methods[0]?.name ?? "");
								}}
							>
								<option value="">Not resolved yet</option>
								{facades.map(({ facade, local }) => (
									<option
										key={`${local}:${facade.id}`}
										value={`${local}:${facade.id}`}
									>
										{local ? "Browser → Node" : "Node → Browser"} ·{" "}
										{facade.wireName} · {facade.id}
									</option>
								))}
							</select>
						</label>
						<p className="inspector-note">
							Fixed target:
							{chosenFacade
								? `${chosenFacade.facade.target.instanceId} / ${chosenFacade.facade.target.peerId} · ${chosenFacade.facade.targetValid ? "Target valid" : "target invalid; calls return real failures"}`
								: "No facade selected"}
						</p>
						<label>
							CallMethod
							<select
								aria-label="CallMethod"
								value={method}
								onChange={(event) => setMethod(event.target.value)}
							>
								{chosenFacade?.facade.methods.map((entry) => (
									<option key={entry.name} value={entry.name}>
										{entry.name}
										{entry.cancelable ? " · cancelable" : ""}
									</option>
								))}
							</select>
						</label>
						<label>
							Business Arguments JSON Array
							<textarea
								aria-label="Business Arguments JSON Array"
								value={argsJson}
								onChange={(event) => setArgsJson(event.target.value)}
							/>
						</label>
						<Button
							disabled={!chosenFacade || !method}
							onClick={() => void invoke()}
						>
							CallRetained Facade
						</Button>
						<p className="inspector-note">
							Each click is an independent call and can overlap; trace is passed
							as explicit application data, and signal is controlled
							independently. JSON that parses still must pass the real Remote
							value-domain precheck.
						</p>
					</section>
				</div>
				<section aria-label="Custom Call Results">
					<h3>Per-call real caller results</h3>
					{calls.length ? (
						calls.map(({ call, local }) => (
							<article
								className="custom-call"
								key={`${local}:${call.id}`}
								data-custom-call={call.id}
							>
								<strong>
									{local ? "Browser → Node" : "Node → Browser"} ·{" "}
									{call.wireName}.{call.method}
								</strong>
								<p className="mono">
									{call.target.instanceId} / {call.target.peerId} · facade{" "}
									{call.facadeId} · trace {call.traceId}
								</p>
								<p data-custom-outcome>
									{call.outcome} · {call.elapsedMs} ms ·{" "}
									{new Date(call.startedAt).toISOString()}
								</p>
								<pre className="payload">
									{props.view.payload
										? formatDevtoolsJson(call.result ?? call.outcome)
										: "Payload hidden / sample data hidden"}
								</pre>
								<div className="custom-actions">
									{call.cancelable && call.outcome === "pending" ? (
										<Button
											onClick={() =>
												void props.execute(
													{
														...commandBase(local),
														action: LabCustomActionEnum.cancel,
														callId: call.id,
													},
													local,
												)
											}
										>
											Cancel This Call
										</Button>
									) : null}
									<Button onClick={() => openRecord(call, local)}>
										{!local && call.target.peerId !== props.peerId
											? "View Node Caller Details"
											: "View Network Records"}
									</Button>
								</div>
							</article>
						))
					) : (
						<p className="empty-state">
							No calls yet. Results remain here after completion; cancellation
							does not mean rollback or handler completion.
						</p>
					)}
				</section>
			</div>
			{nodeDetail !== undefined ? (
				<section aria-label="Node Caller Details" className="custom-card">
					<Button onClick={() => setNodeDetail(undefined)}>
						Back to Custom Experiment
					</Button>
					<h3>Node Caller Details</h3>
					<p>
						Browser handler details for another page must be viewed on the
						target page; Network still shows only this page Session.
					</p>
					{detail ? (
						<>
							<p>
								{detail.wireName}.{detail.method} · {detail.target.peerId} ·{" "}
								{detail.outcome} · {detail.elapsedMs} ms
							</p>
							<p className="mono">{detail.traceId}</p>
							<pre className="payload">
								{props.view.payload
									? formatDevtoolsJson(detail.result ?? detail.outcome)
									: "Payload hidden / sample data hidden"}
							</pre>
							{props.calls
								.filter((record) => record.traceId === detail.traceId)
								.map((record) => (
									<p key={getCallRecordKey(record)}>
										{record.side} · {record.peerId} · {record.outcome}
									</p>
								))}
						</>
					) : (
						<p>Record was cleared or evicted; old records are not restored.</p>
					)}
				</section>
			) : null}
		</div>
	);
}

type MethodDraft = Omit<LabCustomMethod, "delayMs"> & {
	delayMs: string;
	key: string;
};
type DefinitionDraft = {
	copiedFrom?: string;
	id?: string;
	revision?: number;
	instanceId?: string;
	scope: LabCustomScopeEnum;
	peerId: string;
	wireName: string;
	methods: MethodDraft[];
};

function newMethod(): MethodDraft {
	return {
		key: crypto.randomUUID(),
		name: "echo",
		behavior: LabCustomBehaviorEnum.echo,
		valueJson: "null",
		delayMs: "0",
		cancelable: false,
	};
}

function newDraft(): DefinitionDraft {
	return {
		scope: LabCustomScopeEnum.nodeGlobal,
		peerId: "",
		wireName: "",
		methods: [newMethod()],
	};
}

function sourceKey(source: LabCustomFacadeInput & { id: string }): string {
	return `${source.target.instanceId}:${source.target.peerId ?? "acceptor"}:${source.id}`;
}

function validateDraft(draft: DefinitionDraft): string | undefined {
	if (draft.wireName.length === 0) return "Wire Service Name is required";
	if (draft.methods.length === 0) return "At least one method is required";
	const names = new Set<string>();
	for (const method of draft.methods) {
		if (method.name.length === 0) return "Method name is required";
		if (method.name === "then") return "then is a reserved method name";
		if (names.has(method.name)) return "Duplicate method name";
		names.add(method.name);
		const delay = Number(method.delayMs);
		if (
			method.delayMs === "" ||
			!Number.isInteger(delay) ||
			delay < 0 ||
			delay > 10_000
		)
			return "Delay must be an integer from 0 to 10000 ms";
		if (method.behavior === LabCustomBehaviorEnum.fixed) {
			try {
				JSON.parse(method.valueJson);
			} catch {
				return "Fixed return JSON is invalid";
			}
		}
	}
	return undefined;
}
