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
import type { FormEvent, MouseEvent } from "react";
import { createRoot } from "react-dom/client";
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
} from "@/web/devtools";
import { getPeerStatusLabel } from "@/web/utils/get-peer-status-label.util";
import { Workbench } from "@/web/workbench";
import "@/web/styles.css";

const root = element("#root");
const reactRoot = createRoot(root);
const texts: Record<string, string> = {};
let scenario = "unary";
let capacityPending = false;
const greetings: { id: number; text: string }[] = [];
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
			setText("#callback", message);
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
				setText("#callback", message);
				setText("#notice", `Node → ${peerId}: ${message}`);
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
		setText("#transport", getPeerStatusLabel(state.status));
		setText("#recovery-state", state.status);
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
		setText("#supervisor", label);
		setText("#recovery-supervisor", label);
	}),
	client.reconnection.event$.subscribe((event) => {
		setText(
			"#notice",
			`Replacement attempt ${event.attempt} failed during ${event.stage}.`,
		);
	}),
	client.connector.event$.subscribe((event) => {
		diagnostics.record(event);
		recorder.recordEvent(event, peerId);
		scheduleRender();
	}),
];

function handleAction(event: MouseEvent<HTMLButtonElement>): void {
	const target =
		event.target instanceof Element
			? event.target.closest<HTMLButtonElement>("button")
			: null;
	if (!target || target.disabled) return;
	if (target.dataset.scenario) {
		selectScenario(target.dataset.scenario);
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
			setText(
				"#notice",
				"后续监督器尝试已允许；若 Peer 已 closed，请重新加载。",
			);
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
}

function handleSubmit(event: FormEvent<HTMLFormElement>): void {
	event.preventDefault();
	if (!(event.target instanceof HTMLFormElement)) return;
	if (event.target.id === "quote-form") void sendQuote();
	if (event.target.id === "greeting-form") void sendGreeting();
}

function changeView(patch: Partial<DevtoolsView>): void {
	Object.assign(view, patch);
	scheduleRender();
}

function debug(action: string): void {
	if (action === "pause") startReport(true, getReportDelay());
	if (action === "cancel") cancelReport();
	if (action === "resume") void resumeReport();
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
			setText("#peer-name", `${peerId} · Browser ⇄ Node`);
			setText("#notice", "已连接。执行一个场景，在下方检查真实调用。");
			await run("example.greeting.v1", "ready", [], () => greeter.ready());
		} catch (error) {
			setText("#notice", `连接已建立，ready 握手未完成：${errorLabel(error)}`);
		}
		scheduleRender();
	},
	() => {
		setText(
			"#notice",
			"首次连接失败。请启动 Node 服务后重新加载；首次失败不会自动重试。",
		);
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
	setText(selector, `${method} · pending…`);
	const start = performance.now();
	try {
		const value = await run(service, method, args, operation, traceId);
		setText(
			selector,
			`${method} · fulfilled · ${Math.round(performance.now() - start)} ms\n${formatLabValue(value)}`,
		);
		return value;
	} catch (error) {
		setText(
			selector,
			`${method} · ${errorLabel(error)} · ${Math.round(performance.now() - start)} ms`,
		);
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
	if (value) setText("#quote-result", `¥ ${value.amount.toFixed(2)}`);
}

async function sendGreeting(): Promise<void> {
	if (!element<HTMLFormElement>("#greeting-form").reportValidity()) return;
	const count = ++greetingOrdinal;
	const name = input("#name");
	const delay = Number(input("#delay"));
	const row = { id: count, text: `#${count} · Waiting for Node…` };
	greetings.unshift(row);
	greetings.length = Math.min(greetings.length, 12);
	scheduleRender();
	const start = performance.now();
	try {
		const greeting = await run(
			"example.greeting.v1",
			"greet",
			[name, delay],
			() => greeter.greet(name, delay),
		);
		row.text = `#${count} · ${greeting} · ${Math.round(performance.now() - start)} ms round trip`;
	} catch (error) {
		row.text = `#${count} · ${errorLabel(error)}`;
	} finally {
		scheduleRender();
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
		setText("#notice", "先结束或继续当前报表，再启动下一份。");
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
		scheduleRender();
	});
	scheduleRender();
	return active.traceId;
}

function cancelReport(): void {
	if (!report?.pending) return;
	recorder.mark(report.traceId, "Caller requested cancellation");
	report.controller.abort();
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
		setText("#notice", errorLabel(error));
	}
	scheduleRender();
}

function disconnect(): void {
	for (const socket of sockets)
		if (socket.readyState === WebSocket.OPEN)
			socket.close(4001, "Remote Lab fault injection");
	setText(
		"#notice",
		blockReconnections
			? "真实 WebSocket 已断开；替换连接被阻断，等待 5 秒恢复期限。"
			: "真实 WebSocket 已断开；监督器正在尝试恢复原 Session。",
	);
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
		setText(
			"#notice",
			"未观测到处理器进入，未执行断线；检查 Node 快照后重试。",
		);
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
		setText("#value-result", "Invalid JSON · 本地解析失败，未调用 RPC。");
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

function selectScenario(nextScenario: string): void {
	scenario = nextScenario;
	scheduleRender();
	if (scenario === "cancel") selectPanel(DevtoolsPanelEnum.sources);
	if (scenario === "exposure") selectPanel(DevtoolsPanelEnum.services);
	if (scenario === "adapter" || scenario === "errors")
		selectPanel(DevtoolsPanelEnum.console);
}

async function runCapacity(): Promise<void> {
	capacityPending = true;
	setText("#capacity-result", "12 concurrent invocations · pending…");
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
		setText(
			"#capacity-result",
			outcomes
				.map(
					(outcome, index) =>
						`#${index + 1} · ${outcome.status === "fulfilled" ? "fulfilled" : errorLabel(outcome.reason)}`,
				)
				.join("\n"),
		);
	} finally {
		capacityPending = false;
		scheduleRender();
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
	scheduleRender();
}

function setText(selector: string, value: string): void {
	texts[selector] = value;
	scheduleRender();
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
		const unavailable =
			closing ||
			client.connector.peer.state.status !== RpcStateStatusEnum.connected;
		reactRoot.render(
			<Workbench
				texts={{ ...texts }}
				scenario={scenario}
				peerId={peerId}
				transportStatus={client.connector.peer.state.status}
				unavailable={unavailable}
				reportBusy={Boolean(report?.pending || report?.pause)}
				reportCancelable={Boolean(
					report?.pending && !report.controller.signal.aborted,
				)}
				reportResumable={!unavailable && Boolean(report?.pause)}
				capacityPending={capacityPending}
				greetings={greetings}
				onAction={handleAction}
				onSubmit={handleSubmit}
				onViewChange={changeView}
				onDebug={debug}
				devtools={{
					view: { ...view },
					calls,
					entries,
					server,
					reportTrace: report?.traceId,
					pauseRequested: Boolean(report?.pause),
					source,
					browserDiagnostics: diagnostics.snapshot(),
					nodeDiagnostics,
				}}
			/>,
		);
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
		setText(
			"#node-state",
			`${nodeDiagnostics.listenerStatus} · ${server.peers.length} Peers · RPC pending ${diagnostics.snapshot().pendingCalls.length} Browser / ${nodeDiagnostics.pendingCalls.length} Node`,
		);
		scheduleRender();
	} catch {
		if (!polling.signal.aborted)
			setText("#node-state", "Node snapshot unavailable · last observed data");
	} finally {
		if (!polling.signal.aborted)
			later(() => {
				void pollNode();
			}, 500);
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
	setText("#node-state", "HTTP polling stopped · last observed snapshot");
	scheduleRender();
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
			setText("#notice", "Session closed. Reload to create a new Session.");
		} finally {
			for (const subscription of subscriptions) subscription.unsubscribe();
			scheduleRender();
		}
	})();
	return shutdownTask;
}

function reportCleanupError(): void {
	setText("#notice", "Session cleanup failed. Reload before continuing.");
}
