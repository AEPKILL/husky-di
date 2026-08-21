/**
 * @overview Owner retained-byte reservations and bootstrap ingress accounting.
 * @author AEPKILL
 * @created 2026-08-21 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { getRpcProtocol } from "../../src/factories/rpc-protocol.factory";
import { RpcEndpointImpl } from "../../src/impls/protocol/rpc-endpoint.impl";
import {
	RpcRetainedBytesLedgerImpl,
	reserveRpcSessionRetainedBytes,
} from "../../src/impls/protocol/rpc-retained-bytes-ledger.impl";
import { createRpcAcceptor, createRpcConnector } from "../../src/index";
import type {
	IRpcProtocol,
	IRpcProtocolHost,
	IRpcProtocolSession,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import {
	createRpcDirectSessionHarness,
	createRpcTestNetwork,
} from "../protocol/test.utils";

const mebibyte = 1024 * 1024;
const protectedSessionBytes = 512 * 1024;

describe("Default RPC Protocol owner retained bytes", () => {
	it("RPC-RESOURCE-001 RPC-POLICY-002 applies the protected reserve inside the exact Session aggregate", () => {
		const harness = createRpcDirectSessionHarness();
		const remaining = harness.session.reserveRetainedBytes(
			32 * mebibyte - protectedSessionBytes,
		);

		expect(remaining).toBeDefined();
		expect(harness.session.reserveRetainedBytes(1)).toBeUndefined();

		remaining?.release();
		harness.session.forceClose();
	});

	it("RPC-SPI-003 RPC-RESOURCE-003 ignores undeclared custom Session properties", () => {
		const ledger = new RpcRetainedBytesLedgerImpl(1);
		let propertyReads = 0;
		const session = {
			reserveInvocation: () => undefined,
			forceClose() {},
		} as IRpcProtocolSession;
		Object.defineProperty(session, "reserveRetainedBytes", {
			get: () => {
				propertyReads += 1;
				throw new Error(
					"The Framework must not inspect custom Session extras.",
				);
			},
		});

		const reservation = reserveRpcSessionRetainedBytes(
			session,
			(bytes) => ledger.reserve(bytes),
			1,
		);

		expect(propertyReads).toBe(0);
		expect(reservation).toBeDefined();
		reservation?.release();
	});

	it("RPC-RESOURCE-003 reserves the exact owner boundary atomically and releases idempotently", () => {
		const ledger = new RpcRetainedBytesLedgerImpl(10);
		const first = ledger.reserve(7);
		const boundary = ledger.reserve(3);

		expect(first).toBeDefined();
		expect(boundary).toBeDefined();
		expect(ledger.reserve(1)).toBeUndefined();

		first?.release();
		first?.release();
		const replacement = ledger.reserve(7);
		expect(replacement).toBeDefined();
		expect(ledger.reserve(1)).toBeUndefined();

		boundary?.release();
		replacement?.release();
		expect(ledger.reserve(10)).toBeDefined();
	});

	it("RPC-RESOURCE-003 RPC-RESOURCE-004 RPC-SCHEDULE-005 charges queued bootstrap ingress until each callback settles", async () => {
		const ledger = new RpcRetainedBytesLedgerImpl(2);
		const source = new Subject<Uint8Array>();
		const processed: number[] = [];
		const firstCallback = Promise.withResolvers<void>();
		const endpoint = new RpcEndpointImpl({
			connection: {
				message$: source.asObservable(),
				async send() {},
				async close() {},
			},
			reserveRetainedBytes: (bytes) => ledger.reserve(bytes),
			onMessage: async (message) => {
				processed.push(message[0] as number);
				if (message[0] === 1) {
					await firstCallback.promise;
				}
			},
			onFailure: () => {},
		});

		source.next(Uint8Array.of(1));
		source.next(Uint8Array.of(2));
		source.next(Uint8Array.of(3));

		expect(ledger.reserve(1)).toBeUndefined();
		firstCallback.resolve();
		await vi.waitFor(() => {
			expect(processed).toEqual([1, 2, 3]);
			expect(endpoint.isIngressIdle).toBe(true);
		});
		expect(ledger.reserve(2)).toBeDefined();

		endpoint.fenceAndClose();
	});

	it("RPC-RESOURCE-003 RPC-RESOURCE-004 RPC-SCHEDULE-005 rejects owner overflow and releases queued bootstrap ingress on close", () => {
		const ledger = new RpcRetainedBytesLedgerImpl(1);
		const source = new Subject<Uint8Array>();
		const failures: string[] = [];
		let endpoint: RpcEndpointImpl;
		endpoint = new RpcEndpointImpl({
			connection: {
				message$: source.asObservable(),
				async send() {},
				async close() {},
			},
			reserveRetainedBytes: (bytes) => ledger.reserve(bytes),
			onMessage: () => new Promise<void>(() => {}),
			onFailure: (reason) => {
				failures.push(reason);
				endpoint.fenceAndClose();
			},
		});

		source.next(Uint8Array.of(1));
		source.next(Uint8Array.of(2));
		source.next(Uint8Array.of(3));
		expect(failures).toEqual(["resource"]);
		expect(ledger.reserve(1)).toBeDefined();
	});

	it("RPC-RESOURCE-003 RPC-RESOURCE-004 RPC-SCHEDULE-005 releases active charged ingress on close before callback settlement", async () => {
		const ledger = new RpcRetainedBytesLedgerImpl(1);
		const source = new Subject<Uint8Array>();
		let active = false;
		const endpoint = new RpcEndpointImpl({
			connection: {
				message$: source.asObservable(),
				async send() {},
				async close() {},
			},
			reserveRetainedBytes: (bytes) => ledger.reserve(bytes),
			onMessage: (message) => {
				if (message[0] !== 2) {
					return;
				}
				active = true;
				return new Promise<void>(() => {});
			},
			onFailure: () => {},
		});

		source.next(Uint8Array.of(1));
		source.next(Uint8Array.of(2));
		await vi.waitFor(() => expect(active).toBe(true));
		expect(ledger.reserve(1)).toBeUndefined();

		endpoint.fenceAndClose();
		const replacement = ledger.reserve(1);
		expect(replacement).toBeDefined();
		replacement?.release();
	});

	it.each([
		"Acceptor",
		"Connector",
	] as const)("RPC-RESOURCE-002 RPC-RESOURCE-003 holds and releases the %s protected Session reservation", async (role) => {
		const builtIn = getRpcProtocol();
		let capturedHost: IRpcProtocolHost | undefined;
		const protocol: IRpcProtocol = {
			createAcceptor: (host) => {
				if (role === "Acceptor") {
					capturedHost = host;
				}
				return builtIn.createAcceptor(host);
			},
			createConnector: (host) => {
				if (role === "Connector") {
					capturedHost = host;
				}
				return builtIn.createConnector(host);
			},
		};
		const maximumBytes = 4 * mebibyte;
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({
			protocol: role === "Acceptor" ? protocol : undefined,
			runtimePolicy: {
				maxSessions: 1,
				maxHandshakes: 1,
				maxRetainedBytesPerSession: maximumBytes,
				maxRetainedBytesTotal: maximumBytes,
			},
		});
		const connector = createRpcConnector({
			protocol: role === "Connector" ? protocol : undefined,
			runtimePolicy: {
				maxRetainedBytesPerSession: maximumBytes,
			},
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter(),
		});
		if (capturedHost === undefined) {
			throw new Error(`Expected the ${role} host to be captured.`);
		}
		const host = capturedHost as IRpcProtocolHost;
		const remainder = host.reserveRetainedBytes(
			maximumBytes - protectedSessionBytes,
		);
		expect(remainder).toBeDefined();
		expect(host.reserveRetainedBytes(1)).toBeUndefined();
		remainder?.release();

		await Promise.all([connector.close(), acceptor.close()]);
		const afterClose = host.reserveRetainedBytes(maximumBytes);
		expect(afterClose).toBeDefined();
		afterClose?.release();
	});
});
