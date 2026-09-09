/**
 * @overview Verifies owner construction failure.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRpcAcceptor,
	createRpcConnector,
	RpcCloseReasonEnum,
	RpcExceptionCodeEnum,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnectorHost,
	IRpcProtocolSession,
} from "../../src/protocol";
import {
	createRpcProtocolAcceptor,
	createRpcProtocolConnector,
} from "../../src/protocol";
import { createProtocolHarness } from "./test.utils";

describe("cold Topology Owner factories", () => {
	it("RPC-API-001 wraps custom Protocol construction failures", () => {
		const cause = new Error("construction failed");
		const throwingConnectorFactory: RpcProtocolConnectorFactory = () => {
			throw cause;
		};

		try {
			createRpcConnector({ protocolFactory: throwingConnectorFactory });
			throw new Error("Expected Protocol construction to fail.");
		} catch (error) {
			expect(error).toMatchObject({ code: "protocol", cause });
		}

		const invalidConnectorFactory = (() => ({
			async shutdown() {},
			close() {},
			async cleanup() {},
		})) as unknown as RpcProtocolConnectorFactory;
		expect(() =>
			createRpcConnector({ protocolFactory: invalidConnectorFactory }),
		).toThrow(expect.objectContaining({ code: "protocol" }));

		const invalidAcceptorFactory = (() => ({
			async shutdown() {},
			close() {},
			async cleanup() {},
		})) as unknown as RpcProtocolAcceptorFactory;
		expect(() =>
			createRpcAcceptor({ protocolFactory: invalidAcceptorFactory }),
		).toThrow(expect.objectContaining({ code: "protocol" }));

		expect(() =>
			createRpcAcceptor({ protocolFactory: {} as RpcProtocolAcceptorFactory }),
		).toThrow(expect.objectContaining({ code: "protocol" }));
		expect(() =>
			createRpcConnector({ protocolFactory: null as never }),
		).toThrow(expect.objectContaining({ code: "protocol" }));
		expect(() => createRpcAcceptor({ protocolFactory: null as never })).toThrow(
			expect.objectContaining({ code: "protocol" }),
		);
	});

	it.each<{
		readonly port: string;
		readonly invoke: (
			host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
		) => unknown;
		readonly throws: boolean;
	}>([
		{
			port: "reserveRetainedBytes",
			invoke: (host) => host.reserveRetainedBytes(1),
			throws: true,
		},
		{
			port: "fault",
			invoke: (host) =>
				host.fault(RpcCloseReasonEnum.protocolFault, new Error("too early")),
			throws: true,
		},
		{
			port: "attachSession/admitSession",
			invoke: (host) => {
				const session: IRpcProtocolSession = {
					prepareInvocation: () => undefined,
					forceClose() {},
				};
				return "attachSession" in host
					? host.attachSession(session)
					: host.admitSession(session);
			},
			throws: false,
		},
	])("RPC-API-001 RPC-SPI-001 rejects $port during Protocol construction even when swallowed", ({
		invoke,
		throws,
	}) => {
		const failures: unknown[] = [];
		const results: unknown[] = [];
		const hosts: (IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost)[] = [];
		const violate = (
			host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
		) => {
			hosts.push(host);
			try {
				results.push(invoke(host));
			} catch (error) {
				failures.push(error);
			}
		};
		expect(() =>
			createRpcConnector({
				protocolFactory: (host) => {
					violate(host);
					return createRpcProtocolConnector(host);
				},
			}),
		).toThrow(expect.objectContaining({ code: RpcExceptionCodeEnum.protocol }));
		expect(() =>
			createRpcAcceptor({
				protocolFactory: (host) => {
					violate(host);
					return createRpcProtocolAcceptor(host);
				},
			}),
		).toThrow(expect.objectContaining({ code: RpcExceptionCodeEnum.protocol }));
		expect(failures).toEqual(
			throws ? [expect.any(TypeError), expect.any(TypeError)] : [],
		);
		expect(results).toEqual(throws ? [] : [undefined, undefined]);
		expect(hosts).toHaveLength(2);
		for (const host of hosts) {
			expect(() => host.reserveRetainedBytes(1)).toThrow(TypeError);
			expect(() =>
				host.fault(
					RpcCloseReasonEnum.protocolFault,
					new Error("after failure"),
				),
			).toThrow(TypeError);
		}
	});

	it("RPC-API-001 keeps Protocol construction violations sticky through role validation", () => {
		let acceptorValidationRead = false;
		const proxyAcceptorFactory: RpcProtocolAcceptorFactory = (host) =>
			new Proxy(createRpcProtocolAcceptor(host), {
				get(target, property, receiver) {
					if (property === "accept") {
						acceptorValidationRead = true;
						host.admitSession({} as IRpcProtocolSession);
					}
					return Reflect.get(target, property, receiver);
				},
			});
		expect(() =>
			createRpcAcceptor({ protocolFactory: proxyAcceptorFactory }),
		).toThrow(expect.objectContaining({ code: RpcExceptionCodeEnum.protocol }));
		expect(acceptorValidationRead).toBe(true);
	});

	it("RPC-SPI-011 lets the retained Connector host fault its constructed Owner", async () => {
		const harness = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: harness.connectorFactory,
		});
		const host = harness.connectorHosts[0];
		if (host === undefined) {
			throw new Error("Expected the Connector Protocol host.");
		}
		const closeCallsAtProjection: number[] = [];
		connector.state$.subscribe((state) => {
			if (state.status === "closing") {
				closeCallsAtProjection.push(harness.calls.close);
			}
		});
		const fault = new Error("shared Protocol invariant failed");
		host.fault(RpcCloseReasonEnum.protocolFault, fault);

		expect(closeCallsAtProjection).toEqual([1]);
		expect(connector.state).toEqual({ status: "closing" });
		await expect(connector.close()).resolves.toBeUndefined();
		expect(connector.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
			error: { code: "protocol", cause: fault },
		});
		expect(harness.calls.cleanup).toBe(1);
	});
});
