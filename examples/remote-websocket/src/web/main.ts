/**
 * @overview Browser and Node RPC observatory with concurrent calls and explicit lifetime cleanup.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import { RpcException, RpcStateStatusEnum } from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import { REMOTE_GREETING_SERVICE } from "@/consts/remote-services.const";
import { createExampleClient } from "@/factories/example-client.factory";
import { createRpcDiagnostics } from "@/factories/rpc-diagnostics.factory";
import type {
	NodeDiagnosticsSnapshot,
	RpcDiagnosticsSnapshot,
} from "@/types/rpc-diagnostics.type";
import { getPeerStatusLabel } from "@/web/utils/get-peer-status-label.util";
import "@/web/styles.css";

const root = element("#root");
root.innerHTML = `
 <main>
  <header><p class="eyebrow">HUSKY DI / LIVE EXAMPLE</p><h1>One connection.<br>Two directions.</h1>
   <p class="intro">Typed RPC between this browser and Node. Send overlapping calls, watch their lifetimes, and see Node call back.</p>
  </header>
  <section class="connection" aria-label="Connection state">
   <strong id="transport" role="status">Not connected</strong>
   <span>Supervisor: <span id="supervisor">idle</span></span>
   <button id="shutdown" type="button" class="quiet">Close session</button>
  </section>
  <p id="notice" role="status">Connecting to the local Node server…</p>
  <div class="columns">
   <section class="card"><p class="eyebrow">BROWSER → NODE</p><h2>Ask for a greeting</h2>
    <form id="greeting-form">
     <label for="name">Name</label><input id="name" name="name" value="Ada" required maxlength="80" autocomplete="given-name">
     <label for="delay">Node handler delay <span>(milliseconds)</span></label>
     <input id="delay" name="delay" type="number" min="0" max="10000" step="100" value="1500" required>
     <div class="actions"><button id="send" type="submit" disabled>Send greeting</button><button id="burst" type="button" class="quiet" disabled>Send 3 together</button></div>
    </form>
    <ol id="results" class="results" aria-live="polite"><li class="empty">Your replies and round-trip times appear here.</li></ol>
   </section>
   <section class="card"><p class="eyebrow">NODE → BROWSER</p><h2>A service in this tab</h2>
    <p>After this tab declares it is ready, Node calls the browser’s exposed <code>showMessage</code> method. This tab replies with its page title.</p>
    <blockquote id="callback" aria-live="polite">Waiting for Node to call…</blockquote>
    <p class="small">No polling or HTTP endpoint carries this callback: it travels over the same bidirectional WebSocket.</p>
   </section>
  </div>
  <div class="columns">
   <section class="card"><p class="eyebrow">THIS BROWSER</p><h2>Call observatory</h2>
    <p><strong id="browser-pending">0</strong> pending · <span id="browser-total">0</span> events</p>
    <ul id="browser-calls" class="calls"></ul><h3>Recent events <span>latest 24</span></h3><ol id="browser-events" class="events"></ol>
   </section>
   <section class="card"><p class="eyebrow">NODE ACCEPTOR</p><h2>Server observatory</h2>
    <p id="node-state" role="status">Fetching diagnostics…</p>
    <p><strong id="node-pending">0</strong> pending · <span id="node-total">0</span> events</p>
    <ul id="node-calls" class="calls"></ul><h3>Recent events <span>latest 24</span></h3><ol id="node-events" class="events"></ol>
   </section>
  </div>
  <footer><h2>Try transport recovery</h2><p>Keep Node running. Interrupt this tab’s WebSocket with your browser’s network tools, then restore it. The Peer badge reports the actual disconnection; the separate supervisor reports replacement attempts. An initial connection failure requires a reload.</p>
   <p>Recovery retains a Session in memory. Restarting Node loses it. The supervisor makes one immediate replacement attempt, then retries after 0.5, 1, 2, and 5 seconds.</p>
   <p class="small">Loopback development demo · <code>/rpc</code> WebSocket · <code>/api/snapshot</code> payload-free diagnostics</p>
  </footer>
 </main>`;

const notice = element("#notice");
const transport = element("#transport");
const sendButton = element<HTMLButtonElement>("#send");
const burstButton = element<HTMLButtonElement>("#burst");
const shutdownButton = element<HTMLButtonElement>("#shutdown");
const form = element<HTMLFormElement>("#greeting-form");
const nameInput = element<HTMLInputElement>("#name");
const delayInput = element<HTMLInputElement>("#delay");
const results = element("#results");
const diagnostics = createRpcDiagnostics();
const url = new URL("/rpc", window.location.href);
url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const client = createExampleClient({
	adapterFactory: () => createWebSocketConnectorAdapter({ url: url.href }),
	display: {
		showMessage(message) {
			if (typeof message !== "string" || message.length > 160)
				throw new TypeError("Invalid display message.");
			element("#callback").textContent = message;
			return document.title;
		},
	},
});
const greeter = client.connector.peer.resolve(REMOTE_GREETING_SERVICE);
const subscriptions = [
	client.connector.peer.state$.subscribe((state) => {
		transport.textContent = getPeerStatusLabel(state.status);
		transport.dataset.state = state.status;
		sendButton.disabled = burstButton.disabled =
			state.status !== RpcStateStatusEnum.connected;
	}),
	client.reconnection.state$.subscribe((state) => {
		let label: string = state.status;
		if (state.status === RpcStateStatusEnum.reconnecting)
			label += ` · attempt ${state.attempt}`;
		if (state.status === RpcStateStatusEnum.waiting)
			label += ` · ${state.delayMs} ms until attempt ${state.nextAttempt}`;
		if (state.status === RpcStateStatusEnum.stopped)
			label += ` · ${state.reason}`;
		element("#supervisor").textContent = label;
	}),
	client.reconnection.event$.subscribe((event) => {
		notice.textContent = `Replacement attempt ${event.attempt} failed during ${event.stage}.`;
	}),
	client.connector.event$.subscribe((event) => {
		diagnostics.record(event);
		renderDiagnostics("browser", diagnostics.snapshot());
	}),
];
const polling = new AbortController();
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let shutdownTask: Promise<void> | undefined;
let callOrdinal = 0;

form.addEventListener("submit", (event) => {
	event.preventDefault();
	void sendGreeting();
});
burstButton.addEventListener("click", () => {
	if (!form.reportValidity()) return;
	for (let index = 0; index < 3; index += 1) void sendGreeting();
});
shutdownButton.addEventListener("click", () => {
	void shutdown().catch(reportError);
});
window.addEventListener("pagehide", () => {
	void shutdown().catch(reportError);
});
import.meta.hot?.dispose(() => {
	void shutdown().catch(reportError);
});

void client.reconnection.connect().then(
	async () => {
		notice.textContent =
			"Connected. Send several calls while earlier calls are still pending.";
		try {
			await greeter.ready();
		} catch {
			notice.textContent =
				"Connected, but the Node callback failed. Reload to try the ready handshake again.";
		}
	},
	() => {
		notice.textContent =
			"Initial connection failed. Start the Node server and reload this page to try again.";
	},
);
void pollNode();

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
	const found = document.querySelector<T>(selector);
	if (found === null) throw new Error(`Missing element: ${selector}`);
	return found;
}

async function sendGreeting(): Promise<void> {
	if (
		!form.reportValidity() ||
		client.connector.peer.state.status !== RpcStateStatusEnum.connected
	)
		return;
	const ordinal = ++callOrdinal;
	const name = nameInput.value;
	const delay = Number(delayInput.value);
	const start = performance.now();
	const row = document.createElement("li");
	results.querySelector(".empty")?.remove();
	row.textContent = `#${ordinal} · Waiting for Node…`;
	results.prepend(row);
	while (results.childElementCount > 12) results.lastElementChild?.remove();
	try {
		const greeting = await greeter.greet(name, delay);
		row.textContent = `#${ordinal} · ${greeting} · ${Math.round(performance.now() - start)} ms round trip`;
	} catch (error) {
		row.textContent = `#${ordinal} · ${error instanceof RpcException ? error.code : "Call failed"}`;
	}
}

function renderDiagnostics(
	prefix: string,
	snapshot: RpcDiagnosticsSnapshot,
): void {
	element(`#${prefix}-pending`).textContent = String(
		snapshot.pendingCalls.length,
	);
	element(`#${prefix}-total`).textContent = String(snapshot.totalEvents);
	renderRows(
		`#${prefix}-calls`,
		snapshot.pendingCalls.map(
			(call) =>
				`${call.direction} · ${call.service ?? "unknown"}.${call.method ?? "unknown"} · ${call.observationId}`,
		),
		"No pending calls",
	);
	renderRows(`#${prefix}-events`, snapshot.recentEvents, "No events yet");
}

function renderRows(
	selector: string,
	rows: readonly string[],
	fallback: string,
): void {
	element(selector).replaceChildren(
		...(rows.length > 0 ? rows : [fallback]).map((text) => {
			const row = document.createElement("li");
			row.textContent = text;
			return row;
		}),
	);
}

async function pollNode(): Promise<void> {
	try {
		const response = await fetch("/api/snapshot", {
			signal: polling.signal,
			cache: "no-store",
		});
		if (!response.ok) throw new Error("Diagnostics unavailable.");
		const snapshot: NodeDiagnosticsSnapshot = await response.json();
		element("#node-state").textContent =
			`${snapshot.ownerStatus} · listener ${snapshot.listenerStatus} · ${snapshot.peerStatuses.length} peer(s): ${snapshot.peerStatuses.join(", ") || "none"}`;
		renderDiagnostics("node", snapshot);
	} catch {
		if (!polling.signal.aborted)
			element("#node-state").textContent = "Node diagnostics unavailable";
	} finally {
		if (!polling.signal.aborted)
			pollTimer = setTimeout(() => {
				void pollNode();
			}, 500);
	}
}

function shutdown(): Promise<void> {
	shutdownTask ??= (async () => {
		shutdownButton.disabled = true;
		polling.abort();
		element("#node-state").textContent =
			"Diagnostics paused · last observed snapshot";
		clearTimeout(pollTimer);
		try {
			await client.shutdown();
			notice.textContent =
				"Session closed. Reload the page to start a new Session.";
		} finally {
			for (const subscription of subscriptions) subscription.unsubscribe();
		}
	})();
	return shutdownTask;
}

function reportError(): void {
	notice.textContent =
		"Session cleanup failed. Reload the page before continuing.";
}
