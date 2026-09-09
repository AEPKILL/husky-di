/**
 * @overview Verifies acceptor session fault.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	RpcCloseReasonEnum,
	type RpcProtocolAcceptorFactory,
} from "../src/index";
import type { IRpcProtocolAcceptorHost } from "../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../src/protocol";
import { IFaultingService } from "./acceptor/test.utils";

describe("Acceptor termination cleanup", () => {
	it("RPC-SPI-011 keeps the initiating Session fault authoritative across reentrant force", () => {
		let protocolHost: IRpcProtocolAcceptorHost | undefined;
		let sessionHost:
			| ReturnType<IRpcProtocolAcceptorHost["admitSession"]>
			| undefined;
		const fault = new Error("authenticated active Session violation");
		const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
			protocolHost = host;
			return {
				async accept() {},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const acceptor = createRpcAcceptor({ protocolFactory });
		sessionHost = protocolHost?.admitSession({
			prepareInvocation: () => undefined,
			forceClose() {
				sessionHost?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.closed,
					reason: RpcCloseReasonEnum.forcedClose,
				});
			},
		});
		const peer = acceptor.peers[0];
		if (sessionHost === undefined || peer === undefined) {
			throw new Error("Expected an admitted Acceptor Session.");
		}

		sessionHost.fault(RpcCloseReasonEnum.protocolFault, fault);

		expect(peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
			error: { cause: fault },
		});
		expect(acceptor.state).toMatchObject({ status: "active" });
	});

	it("RPC-STATE-002 RPC-SPI-011 contains a peer-local Protocol fault to its Session", async () => {
		let protocolHost: IRpcProtocolAcceptorHost | undefined;
		let firstForceCalls = 0;
		let runtimeCloseCalls = 0;
		const fault = new Error("first Session violated the invocation seam");
		const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
			protocolHost = host;
			return {
				async accept() {},
				async shutdown() {},
				close() {
					runtimeCloseCalls += 1;
				},
				async cleanup() {},
			};
		};
		const acceptor = createRpcAcceptor({ protocolFactory });
		protocolHost?.admitSession({
			prepareInvocation() {
				throw fault;
			},
			forceClose() {
				firstForceCalls += 1;
			},
		});
		protocolHost?.admitSession({
			prepareInvocation: () => undefined,
			forceClose() {},
		});
		const [faultingPeer, healthyPeer] = acceptor.peers;
		if (faultingPeer === undefined || healthyPeer === undefined) {
			throw new Error("Expected two admitted Acceptor peers.");
		}
		const descriptor = createRemoteServiceDescriptor(IFaultingService, {
			wireName: "test.faulting.v1",
			methods: { run: true },
		});

		await expect(faultingPeer.resolve(descriptor).run()).rejects.toMatchObject({
			code: "protocol",
			cause: fault,
		});

		expect(firstForceCalls).toBe(1);
		expect(runtimeCloseCalls).toBe(0);
		expect(acceptor.state).toMatchObject({ status: "active" });
		expect(acceptor.peers).toEqual([healthyPeer]);
		expect(faultingPeer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(healthyPeer.state).toEqual({ status: "connected" });
	});

	it("RPC-STATE-001 RPC-SPI-010 faults only the Session on duplicate or owner-illegal transitions", async () => {
		let protocolHost: IRpcProtocolAcceptorHost | undefined;
		let resolveShutdown!: () => void;
		const forced = [0, 0];
		const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
			protocolHost = host;
			return {
				async accept() {},
				shutdown() {
					return new Promise<void>((resolve) => {
						resolveShutdown = resolve;
					});
				},
				close() {},
				async cleanup() {},
			};
		};
		const acceptor = createRpcAcceptor({ protocolFactory });
		const firstHost = protocolHost?.admitSession({
			prepareInvocation: () => undefined,
			forceClose() {
				forced[0] += 1;
			},
		});
		const secondHost = protocolHost?.admitSession({
			prepareInvocation: () => undefined,
			forceClose() {
				forced[1] += 1;
			},
		});
		if (firstHost === undefined || secondHost === undefined) {
			throw new Error("Expected two admitted Acceptor Sessions.");
		}
		const [, secondPeer] = acceptor.peers;
		if (secondPeer === undefined) {
			throw new Error("Expected the healthy sibling peer.");
		}

		firstHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		firstHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		expect(forced).toEqual([1, 0]);
		expect(acceptor.state).toMatchObject({ status: "active" });
		expect(acceptor.peers).toEqual([secondPeer]);

		const termination = acceptor.shutdown();
		expect(acceptor.state).toEqual({ status: "draining" });
		secondHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		expect(forced).toEqual([1, 1]);
		expect(acceptor.state).toEqual({ status: "draining" });
		expect(acceptor.peers).toEqual([]);

		resolveShutdown();
		await termination;
	});
});
