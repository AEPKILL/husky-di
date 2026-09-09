/**
 * @overview Native DOM views of explicitly recorded application calls and safe RPC observations.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { LAB_METHODS, LAB_SERVICE_NAMES } from "@/consts/lab-services.const";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import type { LabCallRecord, LabLogEntry } from "@/types/lab-recording.type";
import type { LabServerSnapshot } from "@/types/lab-server.type";
import type { RpcDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";

export type DevtoolsView = {
	panel: DevtoolsPanelEnum;
	detail: DevtoolsDetailEnum;
	selected: string | undefined;
	filter: string;
	side: string;
	status: string;
	payload: boolean;
};

export type RenderDevtoolsOptions = {
	readonly view: DevtoolsView;
	readonly calls: readonly LabCallRecord[];
	readonly entries: readonly (LabLogEntry & { readonly side: LabSideEnum })[];
	readonly server: LabServerSnapshot | undefined;
	readonly reportTrace: string | undefined;
	readonly pauseRequested: boolean;
	readonly source: string;
	readonly browserDiagnostics: RpcDiagnosticsSnapshot;
	readonly nodeDiagnostics: RpcDiagnosticsSnapshot | undefined;
};

export enum DevtoolsPanelEnum {
	network = "Network",
	flow = "Flow",
	sources = "Sources",
	services = "Services",
	console = "Console",
}

export enum DevtoolsDetailEnum {
	overview = "Overview",
	payload = "Payload",
	timing = "Timing",
}

export function renderDevtools(options: RenderDevtoolsOptions): void {
	const { view, calls, entries } = options;
	const filtered = calls.filter((call) => {
		const nameMatches =
			`${call.service}.${call.method} ${shortService(call.service)}.${call.method}`
				.toLowerCase()
				.includes(view.filter.toLowerCase());
		const sideMatches = view.side === "all" || call.side === view.side;
		const outcomeMatches =
			view.status === "all" ||
			(view.status === "failed"
				? !["pending", "fulfilled"].includes(call.outcome)
				: call.outcome === view.status);
		return nameMatches && sideMatches && outcomeMatches;
	});
	const selected =
		calls.find((call) => recordKey(call) === view.selected) ?? filtered[0];
	if (selected && !view.selected) view.selected = recordKey(selected);
	const panel = document.querySelector<HTMLElement>("#panel-content");
	if (!panel) return;
	const active = document.activeElement;
	const focusKey =
		active instanceof HTMLButtonElement && panel.contains(active)
			? ["call", "detail", "debug"].find((key) => active.dataset[key])
			: undefined;
	const focusValue =
		focusKey && active instanceof HTMLButtonElement
			? active.dataset[focusKey]
			: undefined;
	const scrollPositions = new Map(
		[
			...panel.querySelectorAll<HTMLElement>(
				".network-list, .detail-body, .console-lines",
			),
		].map((element) => [element.className, element.scrollTop]),
	);
	let contents: HTMLElement;
	switch (view.panel) {
		case DevtoolsPanelEnum.network:
			contents = renderNetwork(filtered, selected, view);
			break;
		case DevtoolsPanelEnum.flow:
			contents = renderFlow(calls, selected, view.payload);
			break;
		case DevtoolsPanelEnum.sources:
			contents = renderSources(options);
			break;
		case DevtoolsPanelEnum.services:
			contents = renderServices(options.server);
			break;
		case DevtoolsPanelEnum.console:
			contents = node("div");
			contents.append(
				renderRpcDiagnostics(options),
				renderConsole(entries.slice(-120), view.payload),
			);
			break;
	}
	panel.replaceChildren(contents);
	for (const element of panel.querySelectorAll<HTMLElement>(
		".network-list, .detail-body, .console-lines",
	)) {
		element.scrollTop = scrollPositions.get(element.className) ?? 0;
	}
	if (focusKey && focusValue) {
		[...panel.querySelectorAll<HTMLButtonElement>("button")]
			.find(
				(button) => button.dataset[focusKey] === focusValue && !button.disabled,
			)
			?.focus({ preventScroll: true });
	}
	document
		.querySelector("#console-preview")
		?.replaceChildren(renderConsole(entries.slice(-3), view.payload));
	setText("#call-count", `${calls.length} APP records`);
	setText(
		"#pending-count",
		`${calls.filter((call) => call.outcome === "pending").length} pending`,
	);
	const summary = entries
		.filter((entry) => entry.source === "TRANSPORT")
		.slice(-5)
		.map((entry) => `${entry.side} · ${entry.summary}`);
	setText("#transport-summary", summary.join("\n") || "等待真实字节观测…");
}

export function recordKey(call: LabCallRecord): string {
	return `${call.side}:${call.id}`;
}

function renderNetwork(
	calls: readonly LabCallRecord[],
	selected: LabCallRecord | undefined,
	view: DevtoolsView,
): HTMLElement {
	const grid = node("div", "", "network-grid");
	const list = node("div", "", "network-list");
	const table = node("table", "", "network-table");
	const head = node("thead");
	const heading = node("tr");
	for (const title of ["Name / Direction", "Outcome", "Time", "Waterfall"])
		heading.append(node("th", title));
	head.append(heading);
	const body = node("tbody");
	const firstAt = Math.min(...calls.map((call) => call.startedAt));
	const endAt = Math.max(...calls.map((call) => call.finishedAt ?? Date.now()));
	for (const call of calls) {
		const row = node(
			"tr",
			"",
			selected && recordKey(call) === recordKey(selected) ? "selected" : "",
		);
		const name = node("td");
		const button = node(
			"button",
			`${shortService(call.service)}.${call.method}`,
			"call-link mono",
		);
		button.dataset.call = recordKey(call);
		button.title = `${call.service}.${call.method}`;
		name.append(
			button,
			node("small", `${call.direction} · ${call.side} · ${call.peerId}`),
		);
		const outcome = node(
			"td",
			call.outcome,
			`mono outcome ${getOutcomeClass(call.outcome)}`,
		);
		const time = node(
			"td",
			`${Math.max(0, (call.finishedAt ?? Date.now()) - call.startedAt)} ms`,
			"mono",
		);
		const waterfall = node("td", "", "waterfall");
		const bar = node(
			"div",
			"",
			`waterfall-bar ${getOutcomeClass(call.outcome)}`,
		);
		const total = Math.max(1, endAt - firstAt);
		bar.style.marginLeft = `${((call.startedAt - firstAt) / total) * 85}%`;
		bar.style.width = `${Math.max(2, (((call.finishedAt ?? Date.now()) - call.startedAt) / total) * 85)}%`;
		bar.title = "APP 记录本机时钟的起止时间；并非网络阶段耗时";
		waterfall.append(bar);
		row.append(name, outcome, time, waterfall);
		body.append(row);
	}
	table.append(head, body);
	list.append(
		table,
		node(
			"p",
			calls.length
				? `${calls.length} 条符合筛选条件 · 点击调用查看详情。两端时钟独立。`
				: "尚无匹配调用。运行上方业务场景，查看真实 APP 调用记录。",
			"empty-state",
		),
	);
	grid.append(list, renderDetails(selected, view));
	return grid;
}

function renderDetails(
	call: LabCallRecord | undefined,
	view: DevtoolsView,
): HTMLElement {
	const detail = node("aside", "", "inspector");
	if (!call) {
		detail.append(
			node("div", "选择一条调用", "inspector-title"),
			node(
				"p",
				"参数、返回值与处理器阶段由示例显式记录；event$ 保持无 payload。",
				"empty-state",
			),
		);
		return detail;
	}
	detail.append(
		node(
			"div",
			`${shortService(call.service)}.${call.method}`,
			"inspector-title mono",
		),
	);
	const tabs = node("nav", "", "detail-tabs");
	for (const name of Object.values(DevtoolsDetailEnum)) {
		const tab = node("button", name);
		tab.dataset.detail = name;
		tab.setAttribute("aria-pressed", String(view.detail === name));
		tabs.append(tab);
	}
	detail.append(tabs);
	const body = node("div", "", "detail-body");
	if (view.detail === DevtoolsDetailEnum.payload) {
		for (const [label, value] of [
			["▾ Arguments", call.arguments],
			["▾ Result / failure", call.result ?? call.outcome],
		]) {
			body.append(
				node("h3", label),
				node("small", "APP · 示例调用包装器", "muted"),
				node(
					"pre",
					view.payload ? value : "Payload hidden / 已隐藏示例数据",
					"payload",
				),
			);
		}
	} else if (view.detail === DevtoolsDetailEnum.timing) {
		body.append(
			node("p", "阶段取自实际应用边界；耗时使用该端自己的时钟。", "help"),
		);
		for (const phase of call.phases)
			body.append(
				property(phase.phase, `+${Math.max(0, phase.at - call.startedAt)} ms`),
			);
	} else {
		for (const [name, value] of [
			["Source", "APP · explicit wrapper"],
			["Side", call.side],
			["Peer", call.peerId],
			["Direction", call.direction],
			["Service", call.service],
			["Method", call.method],
			["Outcome", call.outcome],
			["Application trace", call.traceId],
			["Local APP record", call.id],
		])
			body.append(property(name, value));
	}
	detail.append(
		body,
		node(
			"p",
			"应用 trace 由示例传递；RPC observationId 只在本端配对，不能作为分布式 trace。",
			"inspector-note",
		),
	);
	return detail;
}

function renderFlow(
	calls: readonly LabCallRecord[],
	call: LabCallRecord | undefined,
	payload: boolean,
): HTMLElement {
	const container = node("div", "", "flow-panel");
	if (!call)
		return node(
			"div",
			"先在 Network 中选择一条调用，或执行上方业务。",
			"empty-state",
		);
	container.append(
		node(
			"div",
			`${shortService(call.service)}.${call.method} · ${call.traceId}`,
			"flow-title mono",
		),
	);
	const match = calls.filter((record) => record.traceId === call.traceId);
	const columns = node("div", "", "flow-columns");
	for (const side of [LabSideEnum.browser, LabSideEnum.node]) {
		const column = node("section", "", "flow-endpoint");
		column.append(node("h3", `${side} / APP`));
		const records = match.filter((record) => record.side === side);
		for (const record of records) {
			column.append(
				node(
					"p",
					`${record.direction} · ${record.method} · ${record.outcome}`,
					"mono",
				),
			);
			for (const phase of record.phases) {
				const stage = node("div", "", "flow-stage");
				stage.append(
					node("strong", phase.phase),
					node(
						"small",
						`+${Math.max(0, phase.at - record.startedAt)} ms · actual APP boundary`,
					),
				);
				if (payload && phase.detail) stage.append(node("pre", phase.detail));
				column.append(stage);
			}
		}
		if (!records.length)
			column.append(
				node(
					"p",
					"尚无该端关联记录。旧 greeting 与控制调用可能只在调用端采集。",
					"help",
				),
			);
		columns.append(column);
	}
	container.append(
		columns,
		node(
			"div",
			"Protocol 示意（非测量阶段）：Facade → ordered byte Connection → remote dispatch → handler → terminal result。反向调用交换端角色。",
			"protocol-sketch",
		),
		node(
			"p",
			"只按显式 application trace 关联两端记录。不推导 wire identity，不合并两端时钟，不把连接级字节数当作单次调用流量。",
			"inspector-note",
		),
	);
	return container;
}

function renderSources(options: RenderDevtoolsOptions): HTMLElement {
	const container = node("div", "", "sources-panel");
	const toolbar = node("div", "", "source-toolbar");
	for (const [label, action] of [
		["启动并暂停报表", "pause"],
		["▶ 继续处理器", "resume"],
		["取消调用等待", "cancel"],
	]) {
		const button = node("button", label);
		button.dataset.debug = action;
		if (action === "resume")
			button.disabled =
				!options.pauseRequested &&
				!options.server?.pausedReports.some(
					(report) => report.traceId === options.reportTrace,
				);
		if (action === "cancel")
			button.disabled = !options.calls.some(
				(call) =>
					call.traceId === options.reportTrace &&
					call.side === LabSideEnum.browser &&
					call.outcome === "pending",
			);
		toolbar.append(button);
	}
	toolbar.append(node("span", "业务协作暂停点 · 非 V8/CDP 断点", "muted"));
	const grid = node("div", "", "source-grid");
	const source = node("section");
	const paused = options.server?.pausedReports.find(
		(report) => report.traceId === options.reportTrace,
	);
	const call = options.calls.find(
		(entry) =>
			entry.side === LabSideEnum.browser &&
			entry.traceId === options.reportTrace,
	);
	source.append(
		node(
			"div",
			"lab-host.factory.ts / actual report handler excerpt",
			"source-file",
		),
		node(
			"div",
			paused
				? "Ⅱ Paused · report-ready · 处理器仍占用执行额度"
				: "▶ Cooperative checkpoint · 启动并暂停后查看真实状态",
			paused ? "pause-banner paused" : "pause-banner",
		),
	);
	const code = node("pre", options.source, "source-code");
	source.append(
		code,
		node(
			"p",
			"源码摘录自示例业务处理器。暂停不冻结 RPC 取消、恢复或关闭。",
			"inspector-note",
		),
	);
	const scope = node("aside", "", "inspector");
	scope.append(node("div", "▾ Scope / 当前业务暂停点", "inspector-title"));
	const body = node("div", "", "detail-body");
	for (const [name, value] of [
		["traceId", options.reportTrace ?? "—"],
		["phase", paused ? "paused" : "running / settled / idle"],
		["signal.aborted", paused ? String(paused.aborted) : "—"],
		["caller outcome", call?.outcome ?? "not started"],
		["peer", paused?.peerId ?? "—"],
	])
		body.append(property(name, value));
	scope.append(
		body,
		node(
			"p",
			"取消可以先确定 caller outcome。继续处理器不能把已经确定的 canceled 改成 fulfilled。",
			"inspector-note",
		),
	);
	grid.append(source, scope);
	container.append(toolbar, grid);
	return container;
}

function renderServices(server: LabServerSnapshot | undefined): HTMLElement {
	const container = node("div", "", "services-panel");
	container.append(node("h3", "显式 Descriptor / 方法白名单"));
	for (const [name, methods, scope, status] of [
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
		["example.browser-display.v1", "showMessage", "Browser Peer", "declared"],
	]) {
		const row = node("div", "", "service-row");
		row.append(
			node("strong", name, "mono"),
			node("span", methods, "mono"),
			node("small", scope),
			node("small", status),
		);
		container.append(row);
	}
	for (const peer of server?.peers ?? [])
		container.append(
			property(
				`${peer.id} / example.peer-lab.v1.inspect`,
				peer.peerExposure ? "exposed to this Peer" : "revoked for this Peer",
			),
		);
	container.append(
		node(
			"p",
			"Descriptor 信息来自共享合约；撤销状态来自示例 /api/lab。不是远端注册表反射。全局与 Peer 同名暴露会冲突，不覆盖。",
			"inspector-note",
		),
	);
	return container;
}

function renderConsole(
	entries: readonly (LabLogEntry & { readonly side: LabSideEnum })[],
	payload: boolean,
): HTMLElement {
	const list = node("div", "", "console-lines");
	if (!entries.length)
		return node("div", "等待公开事件或示例插桩记录…", "empty-state");
	for (const entry of entries) {
		const row = node("div", "", "console-line mono");
		row.append(
			node(
				"time",
				new Date(entry.at).toLocaleTimeString("en-GB", { hour12: false }),
			),
			node("strong", entry.source, "source-label"),
			node(
				"span",
				payload || entry.source !== "APP"
					? entry.summary
					: "APP record · payload hidden",
			),
			node("small", entry.side),
		);
		list.append(row);
	}
	return list;
}

function renderRpcDiagnostics(options: RenderDevtoolsOptions): HTMLElement {
	const grid = node("div", "", "rpc-diagnostics");
	for (const [side, snapshot] of [
		[LabSideEnum.browser, options.browserDiagnostics],
		[LabSideEnum.node, options.nodeDiagnostics],
	] as const) {
		const panel = node("section");
		panel.append(
			node(
				"h3",
				`${side} · ${snapshot?.pendingCalls.length ?? 0} RPC pending · ${snapshot?.totalEvents ?? 0} events`,
			),
		);
		const pending = node(
			"pre",
			snapshot?.pendingCalls
				.map(
					(call) =>
						`${call.direction} · ${call.service ?? "unknown"}.${call.method ?? "unknown"} · ${call.observationId}`,
				)
				.join("\n") || "No pending RPC calls",
			"rpc-pending",
		);
		const details = node("details");
		details.dataset.rpcSide = side;
		details.open = [
			...document.querySelectorAll<HTMLDetailsElement>(
				"details[data-rpc-side]",
			),
		].some((previous) => previous.dataset.rpcSide === side && previous.open);
		details.append(
			node("summary", "Recent 24 payload-free events"),
			node(
				"pre",
				snapshot?.recentEvents.slice(0, 24).join("\n") || "No RPC events yet",
			),
		);
		panel.append(pending, details);
		grid.append(panel);
	}
	return grid;
}

function property(name: string, value: string): HTMLElement {
	const row = node("div", "", "property");
	row.append(node("span", name, "muted"), node("span", value, "mono"));
	return row;
}

function node<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text = "",
	className = "",
): HTMLElementTagNameMap[K] {
	const result = document.createElement(tag);
	result.textContent = text;
	result.className = className;
	return result;
}

function setText(selector: string, value: string): void {
	const element = document.querySelector(selector);
	if (element) element.textContent = value;
}

function shortService(service: string): string {
	return service.replace(/^example\./, "").replace(/\.v1$/, "");
}

function getOutcomeClass(outcome: string): string {
	return outcome === "pending"
		? "pending"
		: outcome === "fulfilled"
			? "fulfilled"
			: "failed";
}
