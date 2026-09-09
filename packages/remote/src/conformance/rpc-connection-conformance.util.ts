/**
 * @overview Shared Adapter Connection cases and fixture setup/cleanup helpers.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import {
	assertRpcConformance,
	type IRpcConformanceCase,
	within,
} from "@/conformance/rpc-conformance.util";
import type { OpenedConnection } from "@/conformance/types/rpc-adapter-case.type";

export function createConnectionCases<T>(
	role: "connector" | "acceptor",
	wrap: (
		caseId: string,
		run: (created: T) => Promise<void>,
	) => IRpcConformanceCase,
	open: (created: T) => Promise<OpenedConnection>,
): IRpcConformanceCase[] {
	return [
		wrap(
			`RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 ${role}.message.identity-order-hot-terminal`,
			async (created) => {
				const opened = await open(created);
				await opened.remote.sendToAdapter(new Uint8Array([1]));
				const first = new Uint8Array([2]);
				const second = new Uint8Array([4]);
				const left: Uint8Array[] = [];
				const right: Uint8Array[] = [];
				const late: Uint8Array[] = [];
				let completed = 0;
				opened.connection.message$.subscribe({
					next: (message) => left.push(message),
					complete: () => (completed += 1),
				});
				opened.connection.message$.subscribe({
					next: (message) => right.push(message),
					complete: () => (completed += 1),
				});
				await opened.remote.sendToAdapter(first);
				opened.connection.message$.subscribe((message) => late.push(message));
				await opened.remote.sendToAdapter(second);
				assertRpcConformance(
					left[0] === right[0] && left[0]?.[0] === first[0],
					"Observers received different first-message identity or content.",
				);
				assertRpcConformance(
					left[1] === right[1] &&
						late.length === 1 &&
						late[0] === left[1] &&
						left[1]?.[0] === second[0] &&
						left[0]?.[0] === first[0] &&
						left[0]?.byteLength === first.byteLength,
					"Message order, identity, or stable storage changed.",
				);
				await opened.remote.closeFromRemote();
				const terminalValueCount = left.length;
				await opened.remote
					.sendToAdapter(new Uint8Array([6]))
					.catch(() => undefined);
				assertRpcConformance(
					completed === 2 && left.length === terminalValueCount,
					"Normal terminal was not multicast or admitted a later value.",
				);
				let lateCompleted = false;
				opened.connection.message$.subscribe({
					complete: () => (lateCompleted = true),
				});
				assertRpcConformance(
					lateCompleted,
					"Late observer missed normal terminal.",
				);
				await opened.finish();
			},
		),
		wrap(
			`RPC-TRANSPORT-001 RPC-TRANSPORT-003 ${role}.message.error-identity-terminal`,
			async (created) => {
				const opened = await open(created);
				const transportError = new Error("remote transport failed");
				let observed: unknown;
				let valueCount = 0;
				opened.connection.message$.subscribe({
					next: () => (valueCount += 1),
					error: (error) => (observed = error),
				});
				await opened.remote.setAdapterSendBlocked(true);
				const unsettledSend = rejectionOf(
					opened.connection.send(new Uint8Array([3])),
				);
				await opened.remote.failFromRemote(transportError);
				assertRpcConformance(
					observed === transportError,
					"Transport Error identity changed.",
				);
				assertRpcConformance(
					(await within(unsettledSend, "Failed Transport send")) ===
						transportError,
					"Unsettled send did not reject the Transport Error identity.",
				);
				let late: unknown;
				opened.connection.message$.subscribe({
					error: (error) => (late = error),
				});
				assertRpcConformance(
					late === transportError,
					"Late observer received a different Error.",
				);
				await opened.remote
					.sendToAdapter(new Uint8Array([7]))
					.catch(() => undefined);
				assertRpcConformance(
					valueCount === 0,
					"A message followed the terminal Transport Error.",
				);
				await opened.finish();
			},
		),
		wrap(
			`RPC-TRANSPORT-005 RPC-TRANSPORT-006 ${role}.send.local-admission-backpressure`,
			async (created) => {
				const opened = await open(created);
				const first = new Uint8Array([11, 12]);
				await opened.remote.setAdapterSendBlocked(true);
				const send = opened.connection.send(first);
				let settled = false;
				void send.then(
					() => (settled = true),
					() => (settled = true),
				);
				await turns(2);
				assertRpcConformance(!settled, "Backpressured send settled early.");
				await opened.remote.setAdapterSendBlocked(false);
				await within(send, "Backpressured send");
				first[0] = 99;
				const admitted = await within(
					opened.remote.receiveFromAdapter(),
					"Admitted message",
				);
				assertRpcConformance(
					admitted[0] === 11 && admitted[1] === 12,
					"Adapter borrowed bytes after fulfillment.",
				);
				await opened.connection.send(new Uint8Array([13]));
				assertRpcConformance(
					(await opened.remote.receiveFromAdapter())[0] === 13,
					"Ordered Local Admission failed.",
				);
				await opened.remote.closeFromRemote();
				await opened.finish();
			},
		),
		wrap(
			`RPC-TRANSPORT-006 ${role}.send.one-mebibyte-compatibility`,
			async (created) => {
				const opened = await open(created);
				const message = new Uint8Array(COMPATIBILITY_MESSAGE_BYTES);
				message[0] = 21;
				message[message.length - 1] = 34;
				await within(opened.connection.send(message), "1 MiB send");
				const received = await within(
					opened.remote.receiveFromAdapter(),
					"1 MiB receive",
				);
				assertRpcConformance(
					received.length === COMPATIBILITY_MESSAGE_BYTES &&
						received[0] === 21 &&
						received[received.length - 1] === 34,
					"1 MiB message changed.",
				);
				await opened.remote.closeFromRemote();
				await opened.finish();
			},
		),
		wrap(
			`RPC-TRANSPORT-003 RPC-TRANSPORT-007 ${role}.close.direct-idempotent-race`,
			async (created) => {
				const opened = await open(created);
				let completed = false;
				opened.connection.message$.subscribe({
					complete: () => (completed = true),
				});
				await opened.connection.send(new Uint8Array([54]));
				assertRpcConformance(
					(await opened.remote.receiveFromAdapter())[0] === 54,
					"Direct Close revoked an already fulfilled send.",
				);
				await opened.remote.setAdapterSendBlocked(true);
				const unsettled = rejectionOf(
					opened.connection.send(new Uint8Array([55])),
				);
				const firstClose = opened.connection.close();
				const secondClose = opened.connection.close();
				const laterSend = rejectionOf(
					opened.connection.send(new Uint8Array([56])),
				);
				assertRpcConformance(
					firstClose === secondClose,
					"Repeated Direct Close returned a different Promise.",
				);
				assertRpcConformance(
					(await within(laterSend, "Post-close send")) instanceof Error,
					"close() did not synchronously gate new send.",
				);
				assertRpcConformance(
					(await within(unsettled, "Unsettled send")) instanceof Error,
					"close() did not reject unsettled send.",
				);
				await within(Promise.all([firstClose, secondClose]), "Direct Close");
				await within(
					opened.remote.waitForAdapterClose(),
					"Remote close observation",
				);
				assertRpcConformance(
					opened.remote.isAdapterClosed() && completed,
					"Direct Close did not finish terminal and cleanup.",
				);
				await opened.finish();
			},
		),
	];
}

export function createCaseFactory<T extends { cleanup(): Promise<void> }>(
	fixture: { create(): Promise<T> },
	label: string,
) {
	return (
		caseId: string,
		run: (created: T) => Promise<void>,
	): IRpcConformanceCase => ({
		caseId,
		async run() {
			const created = await within(
				fixture.create(),
				`${label} fixture creation`,
			);
			try {
				await run(created);
			} finally {
				await within(created.cleanup(), `${label} fixture cleanup`);
			}
		},
	});
}

export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		return undefined;
	} catch (error) {
		return error;
	}
}

export function isAbortError(value: unknown): boolean {
	return value instanceof Error && value.name === "AbortError";
}

async function turns(count: number): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await Promise.resolve();
	}
}

const COMPATIBILITY_MESSAGE_BYTES = 1_048_576;
