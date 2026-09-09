/**
 * @overview Runs real browser RPC scenarios and coordinates a docked, explicitly instrumented DevTools workbench.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import { createServiceIdentifier } from "@husky-di/core";
import {
	createRemoteServiceDescriptor,
	RpcCallDirectionEnum,
	RpcException,
	RpcExceptionCodeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import {
	LAB_SERVICE_NAMES,
	REMOTE_LAB_BROWSER_SERVICE,
	REMOTE_LAB_SERVICE,
	REMOTE_PEER_LAB_SERVICE,
	REMOTE_SHIPPING_SERVICE,
} from "@/consts/lab-services.const";
import { REMOTE_GREETING_SERVICE } from "@/consts/remote-services.const";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import { createExampleClient } from "@/factories/example-client.factory";
import labHostSource from "@/factories/lab-host.factory.ts?raw";
import { createLabRecorder } from "@/factories/lab-recorder.factory";
import { createObservedConnectorAdapter } from "@/factories/observed-connector-adapter.factory";
import { createRpcDiagnostics } from "@/factories/rpc-diagnostics.factory";
import type { LabServerSnapshot } from "@/types/lab-server.type";
import type { NodeDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";
import { formatLabValue } from "@/utils/format-lab-value.util";
import {
	DevtoolsDetailEnum,
	DevtoolsPanelEnum,
	type DevtoolsView,
	recordKey,
	renderDevtools,
} from "@/web/devtools";
import { getPeerStatusLabel } from "@/web/utils/get-peer-status-label.util";
import { WORKBENCH_HTML } from "@/web/workbench";
import "@/web/styles.css";

const root = element("#root");
root.innerHTML = WORKBENCH_HTML;
const recorder = createLabRecorder(LabSideEnum.browser);
const diagnostics = createRpcDiagnostics();
const sockets = new Set<WebSocket>();
const polling = new AbortController();
const timers = new Set<ReturnType<typeof setTimeout>>();
const view: DevtoolsView = {
	panel: DevtoolsPanelEnum.network,
	detail: DevtoolsDetailEnum.payload,
	selected: undefined,
	filter: "",
	side: "all",
	status: "all",
	payload: true,
};
let blockReconnections = false;
let peerId = "this-browser";
let server: LabServerSnapshot | undefined;
let nodeDiagnostics: NodeDiagnosticsSnapshot | undefined;
let shutdownTask: Promise<void> | undefined;
let forceTask: Promise<void> | undefined;
let stopTask: Promise<void> | undefined;
let forceRequested = false;
let closing = false;
let renderQueued = false;
let ordinal = 0;
let greetingOrdinal = 0;
let report:
	| {
			traceId: string;
			controller: AbortController;
			pending: boolean;
			pause: boolean;
	  }
	| undefined;

class LabWebSocket extends WebSocket {
	constructor(url: string | URL, protocols?: string | string[]) {
		super(url, protocols);
		sockets.add(this);
		this.addEventListener("close", () => sockets.delete(this), { once: true });
	}
}

const url = new URL("/rpc", window.location.href);
url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const client = createExampleClient({
	runtimePolicy: {
		recoveryGraceMs: 5_000,
		bindingAttemptTimeoutMs: 3_000,
		maxPendingInvocationsPerSession: 8,
	},
	adapterFactory: () => {
		if (blockReconnections)
			throw new Error("Lab fault injection blocks replacement connections.");
		return createObservedConnectorAdapter(
			createWebSocketConnectorAdapter({
				url: url.href,
				webSocket: LabWebSocket,
			}),
			recorder,
		);
	},
	display: {
		showMessage(message) {
			if (typeof message !== "string" || message.length > 160)
				throw new TypeError("Invalid display message.");
			element("#callback").textContent = message;
			return document.title;
		},
	},
});
client.connector.peer.expose(REMOTE_LAB_BROWSER_SERVICE, {
	receive(traceId, message) {
		return recorder.run(
			{
				traceId,
				peerId,
				side: LabSideEnum.browser,
				direction: RpcCallDirectionEnum.incoming,
				service: LAB_SERVICE_NAMES.browser,
				method: "receive",
			},
			[message],
			() => {
				if (typeof message !== "string" || message.length > 500)
					throw new TypeError("Invalid Lab message.");
				element("#callback").textContent = message;
				element("#notice").textContent = `Node → ${peerId}: ${message}`;
				scheduleRender();
				return `${peerId}: ${document.title}`;
			},
		);
	},
});
const lab = client.connector.peer.resolve(REMOTE_LAB_SERVICE);
const shipping = client.connector.peer.resolve(REMOTE_SHIPPING_SERVICE);
const localService = client.connector.peer.resolve(REMOTE_PEER_LAB_SERVICE);
const greeter = client.connector.peer.resolve(REMOTE_GREETING_SERVICE);
const missingService = client.connector.peer.resolve(
	createRemoteServiceDescriptor(
		createServiceIdentifier<{ missing(): Promise<void> }>("MissingLabService"),
		{ wireName: "example.missing.v1", methods: { missing: true } },
	),
);
const missingMethod = client.connector.peer.resolve(
	createRemoteServiceDescriptor(
		createServiceIdentifier<{ missing(): Promise<void> }>("MissingLabMethod"),
		{ wireName: LAB_SERVICE_NAMES.lab, methods: { missing: true } },
	),
);
const subscriptions = [
	client.connector.peer.state$.subscribe((state) => {
		element("#transport").textContent = getPeerStatusLabel(state.status);
		element("#transport").dataset.state = state.status;
		element("#recovery-state").textContent = state.status;
		updateButtons();
		scheduleRender();
	}),
	client.reconnection.state$.subscribe((state) => {
		let label: string = state.status;
		if (state.status === RpcStateStatusEnum.reconnecting)
			label += ` · attempt ${state.attempt}`;
		if (state.status === RpcStateStatusEnum.waiting)
			label += ` · ${state.delayMs} ms → attempt ${state.nextAttempt}`;
		if (state.status === RpcStateStatusEnum.stopped)
			label += ` · ${state.reason}`;
		element("#supervisor").textContent = element(
			"#recovery-supervisor",
		).textContent = label;
	}),
	client.reconnection.event$.subscribe((event) => {
		element("#notice").textContent =
			`Replacement attempt ${event.attempt} failed during ${event.stage}.`;
	}),
	client.connector.event$.subscribe((event) => {
		diagnostics.record(event);
		recorder.recordEvent(event, peerId);
		scheduleRender();
	}),
];

root.addEventListener("click", (event) => {
	const target =
		event.target instanceof Element
			? event.target.closest<HTMLButtonElement>("button")
			: null;
	if (!target || target.disabled) return;
	if (target.dataset.scenario) {
		selectScenario(target.dataset.scenario);
		return;
	}
	if (target.dataset.panel) {
		const panel = Object.values(DevtoolsPanelEnum).find(
			(value) => value === target.dataset.panel,
		);
		if (panel) selectPanel(panel);
		return;
	}
	if (target.dataset.detail) {
		const detail = Object.values(DevtoolsDetailEnum).find(
			(value) => value === target.dataset.detail,
		);
		if (detail) view.detail = detail;
		scheduleRender();
		return;
	}
	if (target.dataset.call) {
		view.selected = target.dataset.call;
		scheduleRender();
		return;
	}
	if (target.dataset.debug) {
		if (target.dataset.debug === "pause") startReport(true, getReportDelay());
		if (target.dataset.debug === "cancel") cancelReport();
		if (target.dataset.debug === "resume") void resumeReport();
		return;
	}
	if (target.dataset.value) {
		void echoPreset(target.dataset.value);
		return;
	}
	if (target.dataset.exposurePeer) {
		const selectedPeer = server?.peers.find(
			(peer) => peer.id === target.dataset.exposurePeer,
		);
		if (selectedPeer)
			void execute(
				"#exposure-result",
				"setPeerExposure",
				[selectedPeer.id, !selectedPeer.peerExposure],
				() => lab.setPeerExposure(selectedPeer.id, !selectedPeer.peerExposure),
			);
		return;
	}
	switch (target.id) {
		case "theme":
			document.documentElement.dataset.theme = isDark() ? "light" : "dark";
			break;
		case "burst":
			if (element<HTMLFormElement>("#greeting-form").reportValidity())
				for (let index = 0; index < 3; index += 1) void sendGreeting();
			break;
		case "report-start":
			startReport(false, getReportDelay());
			break;
		case "report-timeout":
			startReport(false, getReportDelay(), 500);
			break;
		case "report-pause":
			startReport(true, getReportDelay());
			selectPanel(DevtoolsPanelEnum.sources);
			break;
		case "report-cancel":
			cancelReport();
			break;
		case "report-resume":
			void resumeReport();
			break;
		case "disconnect":
			disconnect();
			break;
		case "recovery-report":
			void recoveryDrill(false);
			break;
		case "expire":
			void recoveryDrill(true);
			break;
		case "allow-reconnect":
			blockReconnections = false;
			element("#notice").textContent =
				"后续监督器尝试已允许；若 Peer 已 closed，请重新加载。";
			break;
		case "open-peer":
			window.open(window.location.href, "_blank", "noopener");
			break;
		case "peer-callback":
			void execute(
				"#peers-result",
				"callback",
				[input("#peer-select"), input("#peer-message")],
				() => lab.callback(input("#peer-select"), input("#peer-message")),
			);
			break;
		case "peer-fanout":
			void execute("#peers-result", "fanout", [input("#peer-message")], () =>
				lab.fanout(input("#peer-message")),
			);
			break;
		case "toggle-global":
			void execute(
				"#exposure-result",
				"setGlobalExposure",
				[!server?.globalExposure],
				() => lab.setGlobalExposure(!server?.globalExposure),
			);
			break;
		case "test-shipping":
			void sendQuote("#exposure-result");
			break;
		case "test-local":
			void execute(
				"#exposure-result",
				"inspect",
				[],
				() => localService.inspect(),
				LAB_SERVICE_NAMES.peer,
			);
			break;
		case "exposure-conflict":
			void execute("#exposure-result", "conflict", [], () => lab.conflict());
			break;
		case "value-valid":
			void echoPreset("json");
			break;
		case "handler-fail": {
			const traceId = nextTrace();
			void execute(
				"#error-result",
				"fail",
				[],
				() => lab.fail(traceId),
				LAB_SERVICE_NAMES.lab,
				traceId,
			);
			break;
		}
		case "unknown-service":
			void execute(
				"#error-result",
				"missing",
				[],
				() => missingService.missing(),
				"example.missing.v1",
			);
			break;
		case "unknown-method":
			void execute("#error-result", "missing", [], () =>
				missingMethod.missing(),
			);
			break;
		case "shutdown":
			void shutdown(false).catch(reportCleanupError);
			break;
		case "force-close":
			void shutdown(true).catch(reportCleanupError);
			break;
		case "capacity-run":
			void runCapacity();
			break;
		case "reload":
			window.location.reload();
			break;
		case "clear-records":
			recorder.clear();
			view.selected = undefined;
			scheduleRender();
			break;
	}
});
element<HTMLFormElement>("#quote-form").addEventListener("submit", (event) => {
	event.preventDefault();
	void sendQuote();
});
element<HTMLFormElement>("#greeting-form").addEventListener(
	"submit",
	(event) => {
		event.preventDefault();
		void sendGreeting();
	},
);
for (const id of [
	"call-filter",
	"side-filter",
	"status-filter",
	"show-payload",
]) {
	element(`#${id}`).addEventListener("input", () => {
		view.filter = input("#call-filter");
		view.side = input("#side-filter");
		view.status = input("#status-filter");
		view.payload = element<HTMLInputElement>("#show-payload").checked;
		scheduleRender();
	});
}
window.addEventListener("pagehide", () => {
	void shutdown(false).catch(reportCleanupError);
});
import.meta.hot?.dispose(() => {
	void shutdown(false).catch(reportCleanupError);
});
void client.reconnection.connect().then(
	async () => {
		try {
			peerId = await lab.identify();
			element("#peer-name").textContent = `${peerId} · Browser ⇄ Node`;
			element("#notice").textContent =
				"已连接。执行一个场景，在下方检查真实调用。";
			await run("example.greeting.v1", "ready", [], () => greeter.ready());
		} catch (error) {
			element("#notice").textContent =
				`连接已建立，ready 握手未完成：${errorLabel(error)}`;
		}
		updateButtons();
	},
	() => {
		element("#notice").textContent =
			"首次连接失败。请启动 Node 服务后重新加载；首次失败不会自动重试。";
	},
);
void pollNode();
scheduleRender();

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
	const found = document.querySelector<T>(selector);
	if (!found) throw new Error(`Missing element: ${selector}`);
	return found;
}

function input(selector: string): string {
	return element<HTMLInputElement | HTMLSelectElement>(selector).value;
}
function nextTrace(): string {
	return `${peerId}-${crypto.randomUUID()}-${++ordinal}`;
}
function isDark(): boolean {
	return (
		document.documentElement.dataset.theme === "dark" ||
		(!document.documentElement.dataset.theme &&
			window.matchMedia("(prefers-color-scheme: dark)").matches)
	);
}
function errorLabel(error: unknown): string {
	return error instanceof RpcException
		? `RpcException · ${error.code}`
		: error instanceof TypeError
			? "TypeError · invalid application value or arguments"
			: error instanceof Error
				? error.message
				: "Call failed";
}

async function run<T>(
	service: string,
	method: string,
	args: readonly unknown[],
	operation: () => T | Promise<T>,
	traceId = nextTrace(),
): Promise<T> {
	const result = recorder.run(
		{
			traceId,
			peerId,
			side: LabSideEnum.browser,
			direction: RpcCallDirectionEnum.outgoing,
			service,
			method,
		},
		args,
		operation,
	);
	const record = recorder
		.snapshot()
		.calls.find((call) => call.traceId === traceId);
	if (record) view.selected = recordKey(record);
	scheduleRender();
	try {
		return await result;
	} finally {
		scheduleRender();
	}
}

async function execute<T>(
	selector: string,
	method: string,
	args: readonly unknown[],
	operation: () => T | Promise<T>,
	service: string = LAB_SERVICE_NAMES.lab,
	traceId = nextTrace(),
): Promise<T | undefined> {
	element(selector).textContent = `${method} · pending…`;
	const start = performance.now();
	try {
		const value = await run(service, method, args, operation, traceId);
		element(selector).textContent =
			`${method} · fulfilled · ${Math.round(performance.now() - start)} ms\n${formatLabValue(value)}`;
		return value;
	} catch (error) {
		element(selector).textContent =
			`${method} · ${errorLabel(error)} · ${Math.round(performance.now() - start)} ms`;
		return undefined;
	}
}

async function sendQuote(selector?: string): Promise<void> {
	const form = element<HTMLFormElement>("#quote-form");
	if (!form.reportValidity()) return;
	const from = input("#from");
	const to = input("#to");
	const kg = Number(input("#weight"));
	const traceId = nextTrace();
	const value = await execute(
		selector ?? "#notice",
		"quote",
		[from, to, kg],
		() => shipping.quote(traceId, from, to, kg),
		LAB_SERVICE_NAMES.shipping,
		traceId,
	);
	if (value)
		element("#quote-result").textContent = `¥ ${value.amount.toFixed(2)}`;
}

async function sendGreeting(): Promise<void> {
	if (!element<HTMLFormElement>("#greeting-form").reportValidity()) return;
	const count = ++greetingOrdinal;
	const name = input("#name");
	const delay = Number(input("#delay"));
	const row = document.createElement("li");
	row.textContent = `#${count} · Waiting for Node…`;
	const results = element("#results");
	results.prepend(row);
	while (results.childElementCount > 12) results.lastElementChild?.remove();
	const start = performance.now();
	try {
		const greeting = await run(
			"example.greeting.v1",
			"greet",
			[name, delay],
			() => greeter.greet(name, delay),
		);
		row.textContent = `#${count} · ${greeting} · ${Math.round(performance.now() - start)} ms round trip`;
	} catch (error) {
		row.textContent = `#${count} · ${errorLabel(error)}`;
	}
}

function getReportDelay(): number {
	const delay = element<HTMLInputElement>("#report-delay");
	if (!delay.reportValidity()) return 3000;
	return Number(delay.value);
}

function startReport(
	pause: boolean,
	delay: number,
	timeout?: number,
): string | undefined {
	if (closing || report?.pending || report?.pause) {
		element("#notice").textContent = "先结束或继续当前报表，再启动下一份。";
		return undefined;
	}
	const active = {
		traceId: nextTrace(),
		controller: new AbortController(),
		pending: true,
		pause,
	};
	report = active;
	let timer: ReturnType<typeof setTimeout> | undefined;
	if (timeout !== undefined)
		timer = later(() => {
			recorder.mark(active.traceId, "Application timeout requested");
			active.controller.abort();
		}, timeout);
	void execute(
		"#report-result",
		"report",
		[pause, delay],
		() =>
			lab
				.report(active.traceId, pause, delay, active.controller.signal)
				.catch((error: unknown) => {
					// These outcomes prove no handler can be waiting at the requested pause point.
					if (
						error instanceof TypeError ||
						(error instanceof RpcException &&
							error.code === RpcExceptionCodeEnum.unavailable)
					)
						active.pause = false;
					throw error;
				}),
		LAB_SERVICE_NAMES.lab,
		active.traceId,
	).finally(() => {
		active.pending = false;
		if (timer !== undefined) {
			clearTimeout(timer);
			timers.delete(timer);
		}
		updateButtons();
		scheduleRender();
	});
	updateButtons();
	return active.traceId;
}

function cancelReport(): void {
	if (!report?.pending) return;
	recorder.mark(report.traceId, "Caller requested cancellation");
	report.controller.abort();
	updateButtons();
	scheduleRender();
}

async function resumeReport(): Promise<void> {
	if (!report) return;
	const active = report;
	try {
		await run(LAB_SERVICE_NAMES.lab, "resume", [active.traceId], () =>
			lab.resume(active.traceId),
		);
		active.pause = false;
	} catch (error) {
		element("#notice").textContent = errorLabel(error);
	}
	updateButtons();
	scheduleRender();
}

function disconnect(): void {
	for (const socket of sockets)
		if (socket.readyState === WebSocket.OPEN)
			socket.close(4001, "Remote Lab fault injection");
	element("#notice").textContent = blockReconnections
		? "真实 WebSocket 已断开；替换连接被阻断，等待 5 秒恢复期限。"
		: "真实 WebSocket 已断开；监督器正在尝试恢复原 Session。";
}

async function recoveryDrill(expire: boolean): Promise<void> {
	const traceId = startReport(false, expire ? 8000 : 3000);
	if (!traceId) return;
	const deadline = Date.now() + 4000;
	while (!polling.signal.aborted && Date.now() < deadline) {
		if (server?.recording.calls.some((call) => call.traceId === traceId)) {
			blockReconnections = expire;
			disconnect();
			return;
		}
		await waitForSnapshot();
	}
	if (!polling.signal.aborted)
		element("#notice").textContent =
			"未观测到处理器进入，未执行断线；检查 Node 快照后重试。";
}

async function echoPreset(preset: string): Promise<void> {
	let value: unknown;
	try {
		switch (preset) {
			case "date":
				value = new Date();
				break;
			case "undefined":
				value = { nested: { missing: undefined } };
				break;
			case "cycle": {
				const cycle: Record<string, unknown> = {};
				cycle.self = cycle;
				value = cycle;
				break;
			}
			case "large":
				value = "x".repeat(2 * 1024 * 1024);
				break;
			default:
				value = JSON.parse(input("#value-json"));
		}
	} catch {
		element("#value-result").textContent =
			"Invalid JSON · 本地解析失败，未调用 RPC。";
		return;
	}
	const traceId = nextTrace();
	await execute(
		"#value-result",
		"echo",
		[value],
		() => lab.echo(traceId, value),
		LAB_SERVICE_NAMES.lab,
		traceId,
	);
}

function selectScenario(scenario: string): void {
	for (const section of root.querySelectorAll<HTMLElement>("[data-scene]"))
		section.hidden = section.dataset.scene !== scenario;
	for (const button of root.querySelectorAll<HTMLButtonElement>(
		"[data-scenario]",
	))
		button.setAttribute(
			"aria-pressed",
			String(button.dataset.scenario === scenario),
		);
	if (scenario === "cancel") selectPanel(DevtoolsPanelEnum.sources);
	if (scenario === "exposure") selectPanel(DevtoolsPanelEnum.services);
	if (scenario === "adapter" || scenario === "errors")
		selectPanel(DevtoolsPanelEnum.console);
}

async function runCapacity(): Promise<void> {
	const button = element<HTMLButtonElement>("#capacity-run");
	button.disabled = true;
	element("#capacity-result").textContent =
		"12 concurrent invocations · pending…";
	try {
		const outcomes = await Promise.allSettled(
			Array.from({ length: 12 }, (_, index) =>
				run(
					"example.greeting.v1",
					"greet",
					[`Capacity ${index + 1}`, 1000],
					() => greeter.greet(`Capacity ${index + 1}`, 1000),
				),
			),
		);
		element("#capacity-result").textContent = outcomes
			.map(
				(outcome, index) =>
					`#${index + 1} · ${outcome.status === "fulfilled" ? "fulfilled" : errorLabel(outcome.reason)}`,
			)
			.join("\n");
	} finally {
		updateButtons();
	}
}

function waitForSnapshot(): Promise<void> {
	if (polling.signal.aborted) return Promise.resolve();
	return new Promise<void>((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			timers.delete(timer);
			polling.signal.removeEventListener("abort", finish);
			resolve();
		};
		const timer = later(finish, 50);
		polling.signal.addEventListener("abort", finish, { once: true });
	});
}

function selectPanel(panel: DevtoolsPanelEnum): void {
	view.panel = panel;
	for (const button of root.querySelectorAll<HTMLButtonElement>("[data-panel]"))
		button.setAttribute("aria-pressed", String(button.dataset.panel === panel));
	scheduleRender();
}

function updateButtons(): void {
	const unavailable =
		closing ||
		client.connector.peer.state.status !== RpcStateStatusEnum.connected;
	for (const button of root.querySelectorAll<HTMLButtonElement>(
		"[data-needs-peer]",
	))
		button.disabled = unavailable;
	for (const id of [
		"report-start",
		"report-timeout",
		"report-pause",
		"recovery-report",
		"expire",
	])
		element<HTMLButtonElement>(`#${id}`).disabled =
			unavailable || Boolean(report?.pending || report?.pause);
	element<HTMLButtonElement>("#report-cancel").disabled =
		!report?.pending || report.controller.signal.aborted;
	element<HTMLButtonElement>("#report-resume").disabled =
		unavailable || !report?.pause;
}

function scheduleRender(): void {
	if (renderQueued) return;
	renderQueued = true;
	queueMicrotask(() => {
		renderQueued = false;
		const browser = recorder.snapshot();
		const calls = [...browser.calls, ...(server?.recording.calls ?? [])].sort(
			(a, b) => b.startedAt - a.startedAt,
		);
		const entries = [
			...browser.entries.map((entry) => ({
				...entry,
				side: LabSideEnum.browser,
			})),
			...(server?.recording.entries ?? []).map((entry) => ({
				...entry,
				side: LabSideEnum.node,
			})),
		].sort((a, b) => a.at - b.at);
		const sourceStart = labHostSource.indexOf("if (pause) {");
		const sourceEnd = labHostSource.indexOf("} finally", sourceStart);
		const source = labHostSource
			.slice(sourceStart, sourceEnd)
			.split("\n")
			.map((line) => line.replace(/^\t{6}/, ""))
			.join("\n");
		renderDevtools({
			view,
			calls,
			entries,
			server,
			reportTrace: report?.traceId,
			pauseRequested: Boolean(report?.pause),
			source,
			browserDiagnostics: diagnostics.snapshot(),
			nodeDiagnostics,
		});
	});
}

async function pollNode(): Promise<void> {
	try {
		const responses = await Promise.allSettled(
			["/api/lab", "/api/snapshot"].map(async (path) => {
				const response = await fetch(path, {
					signal: polling.signal,
					cache: "no-store",
				});
				if (!response.ok) throw new Error("Node snapshot unavailable.");
				return response.json();
			}),
		);
		if (polling.signal.aborted) return;
		if (
			responses[0].status !== "fulfilled" ||
			responses[1].status !== "fulfilled"
		)
			throw new Error("Node snapshot unavailable.");
		server = responses[0].value as LabServerSnapshot;
		nodeDiagnostics = responses[1].value as NodeDiagnosticsSnapshot;
		element("#node-state").textContent =
			`${nodeDiagnostics.listenerStatus} · ${server.peers.length} Peers · RPC pending ${diagnostics.snapshot().pendingCalls.length} Browser / ${nodeDiagnostics.pendingCalls.length} Node`;
		updatePeerControls();
		scheduleRender();
	} catch {
		if (!polling.signal.aborted)
			element("#node-state").textContent =
				"Node snapshot unavailable · last observed data";
	} finally {
		if (!polling.signal.aborted)
			later(() => {
				void pollNode();
			}, 500);
	}
}

function updatePeerControls(): void {
	if (!server) return;
	const focusedPeer =
		document.activeElement instanceof HTMLButtonElement
			? document.activeElement.dataset.exposurePeer
			: undefined;
	const select = element<HTMLSelectElement>("#peer-select");
	const previous = select.value;
	const peers = server.peers.filter(
		(peer) => peer.status === RpcStateStatusEnum.connected,
	);
	select.replaceChildren(
		...peers.map((peer) => {
			const option = document.createElement("option");
			option.value = peer.id;
			option.textContent = `${peer.id}${peer.id === peerId ? " (this tab)" : ""}`;
			return option;
		}),
	);
	if (peers.some((peer) => peer.id === previous)) select.value = previous;
	element("#handler-entries").textContent = String(
		server.peers.find((peer) => peer.id === peerId)?.handlerEntries ?? 0,
	);
	element("#toggle-global").textContent = server.globalExposure
		? "撤销全局 shipping"
		: "恢复全局 shipping";
	element("#peer-exposures").replaceChildren(
		...server.peers.map((peer) => {
			const row = document.createElement("div");
			row.className = "peer-exposure";
			const label = document.createElement("span");
			label.textContent = `${peer.id} · ${peer.status} · inspect ${peer.peerExposure ? "exposed" : "revoked"}`;
			const button = document.createElement("button");
			button.textContent = peer.peerExposure ? "撤销此 Peer" : "恢复此 Peer";
			button.dataset.exposurePeer = peer.id;
			button.disabled =
				closing ||
				client.connector.peer.state.status !== RpcStateStatusEnum.connected;
			row.append(label, button);
			return row;
		}),
	);
	if (focusedPeer) {
		[...root.querySelectorAll<HTMLButtonElement>("[data-exposure-peer]")]
			.find(
				(button) =>
					button.dataset.exposurePeer === focusedPeer && !button.disabled,
			)
			?.focus({ preventScroll: true });
	}
}

function later(
	callback: () => void,
	delay: number,
): ReturnType<typeof setTimeout> {
	const timer = setTimeout(() => {
		timers.delete(timer);
		callback();
	}, delay);
	timers.add(timer);
	return timer;
}

function shutdown(force: boolean): Promise<void> {
	closing = true;
	forceRequested ||= force;
	polling.abort();
	for (const timer of timers) clearTimeout(timer);
	timers.clear();
	element("#node-state").textContent =
		"HTTP polling stopped · last observed snapshot";
	updateButtons();
	stopTask ??= client.reconnection.stop();
	if (force) {
		forceTask ??= stopTask.then(() => client.connector.close());
		void forceTask.catch(reportCleanupError);
	}
	shutdownTask ??= (async () => {
		try {
			await stopTask;
			if (forceRequested) {
				forceTask ??= client.connector.close();
				await forceTask;
			} else await client.connector.shutdown();
			element("#notice").textContent =
				"Session closed. Reload to create a new Session.";
		} finally {
			for (const subscription of subscriptions) subscription.unsubscribe();
			scheduleRender();
		}
	})();
	return shutdownTask;
}

function reportCleanupError(): void {
	element("#notice").textContent =
		"Session cleanup failed. Reload before continuing.";
}
