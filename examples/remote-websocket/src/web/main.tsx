/**
 * @overview React, TanStack Query, Tailwind, and shadcn/ui RPC observatory.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import {
	createRpcConnector,
	RpcException,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import {
	QueryClient,
	QueryClientProvider,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import {
	REMOTE_BROWSER_DISPLAY_SERVICE,
	REMOTE_GREETING_SERVICE,
} from "@/consts/remote-services.const";
import type {
	NodeDiagnosticsSnapshot,
	PendingCallDiagnostic,
	RpcEventDiagnostic,
} from "@/types/rpc-diagnostics.type";
import "@/web/styles.css";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/web/components/ui/card";
import { Input } from "@/web/components/ui/input";
import { useRpcConnectorReconnection } from "@/web/hooks/use-rpc-connector-reconnection";
import { useRpcObservatory } from "@/web/hooks/use-rpc-observatory";
import { getRpcControlAvailability } from "@/web/utils/rpc-control-availability.util";
import { getRpcPeerStatusPresentation } from "@/web/utils/rpc-peer-status-presentation.util";

const connector = createRpcConnector();
const greetingService = connector.peer.resolve(REMOTE_GREETING_SERVICE);
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
let showBrowserMessage = (_message: string): string => document.title;

connector.peer.expose(REMOTE_BROWSER_DISPLAY_SERVICE, {
	showMessage: (message) => showBrowserMessage(message),
});

function App() {
	const [name, setName] = useState("Web browser");
	const [delayMs, setDelayMs] = useState(2_000);
	const [greetingController, setGreetingController] =
		useState<AbortController>();
	const [nodeMessage, setNodeMessage] = useState("Waiting for Node…");
	const [serverClock, setServerClock] = useState("Waiting for stream…");
	const { connectorState, peerState, pendingCalls, events } =
		useRpcObservatory(connector);
	const connected = peerState.status === RpcStateStatusEnum.connected;
	useEffect(() => {
		if (!connected) return;
		const subscription = greetingService.clock$.subscribe({
			next: setServerClock,
			error: () => setServerClock("Stream unavailable"),
		});
		return () => subscription.unsubscribe();
	}, [connected]);
	const peerStatusPresentation = getRpcPeerStatusPresentation(peerState.status);
	const nodeDiagnostics = useQuery({
		queryKey: ["node-diagnostics"],
		queryFn: fetchNodeDiagnostics,
		refetchInterval: 1_000,
	});
	const greeting = useMutation({
		mutationFn: ({
			value,
			delay,
			signal,
		}: {
			value: string;
			delay: number;
			signal: AbortSignal | undefined;
		}) =>
			signal === undefined
				? greetingService.greet(value, delay)
				: greetingService.greetCancelable(value, delay, signal),
		onSettled: (_data, _error, variables) => {
			if (variables.signal === undefined) {
				return;
			}
			setGreetingController((current) =>
				current?.signal === variables.signal ? undefined : current,
			);
		},
	});
	const {
		connectionError,
		disconnectTransport,
		manualRecoveryReady,
		recoverTransport,
		transportOperationPending,
	} = useRpcConnectorReconnection(connector);
	const rpcControls = getRpcControlAvailability(
		peerState.status,
		manualRecoveryReady,
		transportOperationPending,
	);

	useEffect(() => {
		let active = true;
		showBrowserMessage = (message) => {
			if (active) {
				setNodeMessage(message);
			}
			return document.title;
		};

		return () => {
			active = false;
		};
	}, []);

	function submitGreeting(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		if (greetingController !== undefined) {
			return;
		}
		greeting.mutate({ value: name, delay: delayMs, signal: undefined });
	}

	function launchCancelableGreeting(): void {
		if (greetingController !== undefined) {
			return;
		}
		const controller = new AbortController();
		setGreetingController(controller);
		greeting.mutate({
			value: name,
			delay: delayMs,
			signal: controller.signal,
		});
	}

	function launchBurst(): void {
		for (let index = 1; index <= 3; index += 1) {
			greeting.mutate({
				value: `${name} #${index}`,
				delay: delayMs,
				signal: undefined,
			});
		}
	}

	const node = nodeDiagnostics.data;

	return (
		<main className="rpc-grid min-h-screen bg-background text-foreground">
			<div className="mx-auto max-w-[1500px] space-y-6 px-4 py-8 md:px-8 lg:py-12">
				<header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
					<div className="space-y-2">
						<Badge variant={peerStatusPresentation.variant}>
							<span className="mr-2 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
							{peerStatusPresentation.label}
						</Badge>
						<h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
							RPC Observatory
						</h1>
						<p className="max-w-2xl text-sm text-muted-foreground md:text-base">
							A live view of the public owner, peer, call ledger, and event
							streams on a bidirectional WebSocket session.
						</p>
					</div>
					<div className="flex flex-col items-start gap-3 md:items-end">
						<div className="font-mono text-xs text-muted-foreground">
							profile: husky-di-rpc/1 · transport: websocket
						</div>
						<div className="flex gap-2">
							<Button
								disabled={!rpcControls.disconnect}
								onClick={disconnectTransport}
								type="button"
								variant="outline"
							>
								Disconnect
							</Button>
							<Button
								disabled={!rpcControls.recover}
								onClick={recoverTransport}
								type="button"
								variant="outline"
							>
								Recover
							</Button>
						</div>
					</div>
				</header>

				<Card className="overflow-hidden border-primary/20 bg-card/80 backdrop-blur">
					<CardContent className="p-5 md:p-7">
						<div className="grid items-center gap-4 md:grid-cols-[1fr_minmax(180px,0.7fr)_1fr]">
							<TopologyNode
								label="React browser"
								ownerState={connectorState.status}
								peerState={peerState.status}
								active={connected}
							/>
							<div className="space-y-2 text-center">
								<div className="flow-line relative h-px overflow-hidden bg-border" />
								<p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
									binary frames · ordered
								</p>
							</div>
							<TopologyNode
								label="Node acceptor"
								ownerState={node?.ownerStatus ?? "loading"}
								peerState={node?.peerStatuses[0] ?? "unbound"}
								active={node?.listenerStatus === "listening"}
							/>
						</div>
					</CardContent>
				</Card>

				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<Metric
						label="Browser pendingCalls"
						value={pendingCalls.length}
						detail="derived from event$"
					/>
					<Metric
						label="Node pendingCalls"
						value={node?.pendingCalls ?? "—"}
						detail="remote snapshot"
					/>
					<Metric
						label="Accepted peers"
						value={node?.peerCount ?? "—"}
						detail={node?.listenerStatus ?? "querying"}
					/>
					<Metric
						label="Node events"
						value={node?.totalEvents ?? "—"}
						detail="owner event ledger"
					/>
				</div>

				<div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Call playground</CardTitle>
								<CardDescription>
									Add latency, launch overlapping calls, and watch pendingCalls
									change in real time.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<form className="space-y-5" onSubmit={submitGreeting}>
									<div className="space-y-2">
										<label className="text-sm font-medium" htmlFor="name">
											RPC argument
										</label>
										<Input
											id="name"
											value={name}
											onChange={(event) => setName(event.target.value)}
											required
										/>
									</div>
									<div className="space-y-3">
										<div className="flex justify-between text-sm">
											<label htmlFor="delay">Handler delay</label>
											<span className="font-mono text-primary">
												{delayMs} ms
											</span>
										</div>
										<input
											aria-label="Handler delay"
											className="w-full accent-primary"
											id="delay"
											max="5000"
											min="250"
											onChange={(event) =>
												setDelayMs(Number(event.target.value))
											}
											step="250"
											type="range"
											value={delayMs}
										/>
									</div>
									<div className="flex flex-wrap gap-3">
										<Button
											disabled={
												!rpcControls.call || greetingController !== undefined
											}
											type="submit"
										>
											Launch RPC
										</Button>
										<Button
											disabled={
												!rpcControls.call || greetingController !== undefined
											}
											onClick={launchCancelableGreeting}
											type="button"
											variant="outline"
										>
											Launch cancellable RPC
										</Button>
										<Button
											disabled={greetingController === undefined}
											onClick={() => greetingController?.abort()}
											type="button"
											variant="outline"
										>
											Abort RPC
										</Button>
										<Button
											disabled={
												!rpcControls.call || greetingController !== undefined
											}
											onClick={launchBurst}
											type="button"
											variant="outline"
										>
											Launch 3-call burst
										</Button>
									</div>
								</form>
								<div
									className="mt-5 rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm"
									data-testid="greeting-result"
								>
									{greeting.error instanceof RpcException
										? `RPC ${greeting.error.code}`
										: (greeting.error?.message ??
											greeting.data ??
											"No result yet")}
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Node → Web inbox</CardTitle>
								<CardDescription>
									The Node peer resolves a service exposed by this browser.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<p
									className="rounded-lg border border-primary/20 bg-primary/5 p-4 font-mono text-sm text-primary"
									data-testid="node-message"
								>
									{nodeMessage} · {serverClock}
								</p>
							</CardContent>
						</Card>
					</div>

					<div className="space-y-6">
						<PendingCalls calls={pendingCalls} />
						<StateInspector
							connectorState={connectorState}
							nodeState={node}
							peerState={peerState}
						/>
						<EventStream events={events} />
					</div>
				</div>

				{connectionError === undefined ? null : (
					<p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
						{connectionError}
					</p>
				)}
			</div>
		</main>
	);
}

function TopologyNode({
	label,
	ownerState,
	peerState,
	active,
}: {
	readonly label: string;
	readonly ownerState: string;
	readonly peerState: string;
	readonly active: boolean;
}) {
	return (
		<div className="rounded-lg border border-border bg-background/80 p-4">
			<div className="mb-4 flex items-center justify-between">
				<p className="font-medium">{label}</p>
				<span
					className={`h-2.5 w-2.5 rounded-full ${active ? "bg-primary shadow-[0_0_16px_var(--primary)]" : "bg-muted-foreground"}`}
				/>
			</div>
			<div className="flex flex-wrap gap-2">
				<Badge variant={stateVariant(ownerState)}>owner · {ownerState}</Badge>
				<Badge variant={stateVariant(peerState)}>peer · {peerState}</Badge>
			</div>
		</div>
	);
}

function Metric({
	label,
	value,
	detail,
}: {
	readonly label: string;
	readonly value: string | number;
	readonly detail: string;
}) {
	return (
		<Card className="bg-card/70">
			<CardContent className="p-5">
				<p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
					{label}
				</p>
				<p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
				<p className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
					{detail}
				</p>
			</CardContent>
		</Card>
	);
}

function PendingCalls({
	calls,
}: {
	readonly calls: readonly PendingCallDiagnostic[];
}) {
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<div>
					<CardTitle>pendingCalls</CardTitle>
					<CardDescription>
						Unmatched call-started observations.
					</CardDescription>
				</div>
				<Badge variant={calls.length === 0 ? "muted" : "warning"}>
					{calls.length} active
				</Badge>
			</CardHeader>
			<CardContent>
				{calls.length === 0 ? (
					<div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
						No calls waiting for a terminal event.
					</div>
				) : (
					<div className="space-y-2" data-testid="pending-calls">
						{calls.map((call) => (
							<div
								className="grid gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-center"
								key={call.observationId}
							>
								<Badge variant="warning">{call.direction}</Badge>
								<div className="min-w-0 font-mono text-xs">
									<p className="truncate">{call.service}</p>
									<p className="text-muted-foreground">.{call.member}()</p>
								</div>
								<span className="font-mono text-xs tabular-nums text-warning">
									{Date.now() - call.startedAt} ms
								</span>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function EventStream({
	events,
}: {
	readonly events: readonly RpcEventDiagnostic[];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Event stream</CardTitle>
				<CardDescription>
					Newest first · capped at 40 observations
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
					{events.map((event) => (
						<div
							className="grid gap-2 rounded-lg border border-border bg-background/60 p-3 sm:grid-cols-[90px_1fr_auto] sm:items-center"
							key={`${event.id}-${event.type}-${event.timestamp}`}
						>
							<Badge variant={eventVariant(event)}>{event.type}</Badge>
							<div className="min-w-0 font-mono text-xs">
								<p className="truncate">
									{event.direction === undefined
										? "topology"
										: `${event.direction} · ${event.service ?? "unknown"}.${event.member ?? "unknown"}`}
								</p>
								<p className="text-muted-foreground">{getEventDetail(event)}</p>
							</div>
							<time className="font-mono text-[0.68rem] text-muted-foreground">
								{new Date(event.timestamp).toLocaleTimeString()}
							</time>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function StateInspector({
	connectorState,
	peerState,
	nodeState,
}: {
	readonly connectorState: unknown;
	readonly peerState: unknown;
	readonly nodeState: unknown;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>State inspector</CardTitle>
				<CardDescription>
					Complete caller-visible state snapshots, without private deep imports.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3 md:grid-cols-3">
				<StateBlock label="connector.state" value={connectorState} />
				<StateBlock label="peer.state" value={peerState} />
				<StateBlock label="node snapshot" value={nodeState} />
			</CardContent>
		</Card>
	);
}

function StateBlock({
	label,
	value,
}: {
	readonly label: string;
	readonly value: unknown;
}) {
	return (
		<div className="min-w-0 rounded-lg border border-border bg-background/60 p-3">
			<p className="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-primary">
				{label}
			</p>
			<pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[0.7rem] leading-5 text-muted-foreground">
				{JSON.stringify(value ?? { status: "loading" }, null, 2)}
			</pre>
		</div>
	);
}

function stateVariant(status: string): "default" | "muted" | "warning" {
	if (status === "connected" || status === "active" || status === "listening")
		return "default";
	if (status === "connecting" || status === "starting" || status === "loading")
		return "warning";
	return "muted";
}

function eventVariant(
	event: RpcEventDiagnostic,
): "default" | "muted" | "warning" | "danger" {
	if (event.outcome === "rejected" || event.outcome === "failed")
		return "danger";
	if (event.type === "call-started") return "warning";
	if (event.type === "call-finished" || event.type === "peer-opened")
		return "default";
	return "muted";
}

function getEventDetail(event: RpcEventDiagnostic): string {
	return [event.outcome, event.code].filter(Boolean).join(" · ") || "observed";
}

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Missing #root element.");

createRoot(rootElement).render(
	<QueryClientProvider client={queryClient}>
		<App />
	</QueryClientProvider>,
);

async function fetchNodeDiagnostics(): Promise<NodeDiagnosticsSnapshot> {
	const response = await fetch("/api/snapshot");
	if (!response.ok) {
		throw new Error(`Node diagnostics request failed with ${response.status}.`);
	}
	return response.json() as Promise<NodeDiagnosticsSnapshot>;
}
