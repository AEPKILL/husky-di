/**
 * @overview Browser-executed Observable stream and v1 fallback release scenarios.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03
 */

import { createServiceIdentifier } from "@husky-di/core";
import {
	firstValueFrom,
	Observable,
	of,
	Subject,
	throwError,
	toArray,
} from "rxjs";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	RpcCallDirectionEnum,
	RpcException,
} from "../../../src/index";
import { createBrowserMemoryNetwork, waitFor } from "../network/test.utils";

export async function runRpcBrowserStreams() {
	const descriptor = createBrowserStreamDescriptor();
	const network = createBrowserMemoryNetwork();
	const live = new Subject<number>();
	const updates = new Subject<number>();
	let methodStarts = 0;
	let methodStops = 0;
	let staticStarts = 0;
	let staticStops = 0;
	let staticOpens = 0;
	const implementation: IBrowserStreamService = {
		value: () => 42,
		watch(mode) {
			if (mode === "finite") return of(1, 2, 3);
			if (mode === "error")
				return throwError(() => new Error("private source failure"));
			return new Observable<number>((observer) => {
				methodStarts += 1;
				const source = live.subscribe(observer);
				return () => {
					methodStops += 1;
					source.unsubscribe();
				};
			});
		},
		updates$: new Observable<number>((observer) => {
			staticStarts += 1;
			const source = updates.subscribe(observer);
			return () => {
				staticStops += 1;
				source.unsubscribe();
			};
		}),
	};
	const acceptor = createRpcAcceptor({
		interceptor(context, next) {
			if (
				context.direction === RpcCallDirectionEnum.incoming &&
				context.method === "updates$"
			)
				staticOpens += 1;
			return next();
		},
	});
	const connector = createRpcConnector();
	acceptor.expose(descriptor, implementation);
	const staticLazy = staticStarts === 0;
	await acceptor.listen(network.acceptorAdapter);
	await connector.connect({ adapter: network.createConnectorAdapter() });
	try {
		const remote = connector.peer.resolve(descriptor);
		const staticFacade = remote.updates$;
		const methodValues = await firstValueFrom(
			remote.watch("finite").pipe(toArray()),
		);
		let sourceError = "";
		try {
			await firstValueFrom(remote.watch("error"));
		} catch (error) {
			if (!(error instanceof RpcException)) throw error;
			sourceError = error.code;
		}
		const firstValues: number[] = [];
		const secondValues: number[] = [];
		let staticCompletions = 0;
		const first = remote.updates$.subscribe((value) => firstValues.push(value));
		const second = remote.updates$.subscribe({
			next: (value) => secondValues.push(value),
			complete: () => {
				staticCompletions += 1;
			},
		});
		await waitFor(
			() => staticOpens === 2 && staticStarts === 1,
			"Static streams did not share their lazy source.",
		);
		updates.next(7);
		await waitFor(
			() => firstValues.length === 1 && secondValues.length === 1,
			"Static stream did not multicast.",
		);
		first.unsubscribe();
		updates.complete();
		await waitFor(
			() => staticStops === 1 && staticCompletions === 1,
			"Static final subscriber did not release the source.",
		);
		second.unsubscribe();
		const recoveredValues: number[] = [];
		const cancellationNotifications: string[] = [];
		const retained = remote.watch("retained").subscribe({
			next: (value) => recoveredValues.push(value),
			complete: () => cancellationNotifications.push("complete"),
			error: () => cancellationNotifications.push("error"),
		});
		await waitFor(() => methodStarts === 1, "Method stream did not start.");
		live.next(10);
		await waitFor(
			() => recoveredValues.length === 1,
			"Initial stream item was not delivered.",
		);
		network.disconnect(0);
		await waitFor(
			() => connector.peer.state.status === "recovering",
			"Stream Session did not recover.",
		);
		live.next(11);
		live.next(12);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		await waitFor(
			() => recoveredValues.length === 3,
			"Retained stream items were not replayed.",
		);
		retained.unsubscribe();
		await waitFor(
			() => methodStops === 1,
			"Unsubscribe did not tear down remote source.",
		);
		return {
			methodValues,
			sourceError,
			staticLazy,
			staticStarts,
			staticStops,
			staticCompletions,
			firstValues,
			secondValues,
			recoveredValues,
			methodStarts,
			methodStops,
			cancellationNotifications,
			stableStaticFacade: staticFacade === remote.updates$,
			v1: await runBrowserV1Fallback(descriptor, implementation),
		};
	} finally {
		await connector.close();
		await acceptor.close();
	}
}

interface IBrowserStreamService {
	value(): number;
	watch(mode: string): Observable<number>;
	readonly updates$: Observable<number>;
}

const IBrowserStreamService = createServiceIdentifier<IBrowserStreamService>(
	"IBrowserStreamService",
);

async function runBrowserV1Fallback(
	descriptor: ReturnType<typeof createBrowserStreamDescriptor>,
	implementation: IBrowserStreamService,
) {
	const network = createBrowserMemoryNetwork(true);
	const acceptor = createRpcAcceptor();
	const connector = createRpcConnector();
	acceptor.expose(descriptor, implementation);
	await acceptor.listen(network.acceptorAdapter);
	await connector.connect({ adapter: network.createConnectorAdapter() });
	try {
		const remote = connector.peer.resolve(descriptor);
		const unaryResult = await remote.value();
		let streamError = "";
		try {
			await firstValueFrom(remote.watch("finite"));
		} catch (error) {
			if (!(error instanceof RpcException)) throw error;
			streamError = error.code;
		}
		const streamSent = network.records.some(({ record }) => {
			const message = record.message as { readonly kind?: string } | undefined;
			return message?.kind?.startsWith("stream-");
		});
		return {
			unaryResult,
			streamError,
			streamSent,
			connected: connector.peer.state.status === "connected",
		};
	} finally {
		await connector.close();
		await acceptor.close();
	}
}

function createBrowserStreamDescriptor() {
	return createRemoteServiceDescriptor(IBrowserStreamService, {
		wireName: "browser.streams",
		members: {
			value: { kind: "function" },
			watch: { kind: "observable-function" },
			updates$: { kind: "observable" },
		},
	});
}
