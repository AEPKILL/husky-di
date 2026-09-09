/**
 * @overview Verifies acceptor terminal batch.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	type IRpcAcceptor,
	RpcCloseReasonEnum,
	RpcExceptionCodeEnum,
} from "../../src/index";
import type { IRpcProtocolSession, RpcCallOutcome } from "../../src/protocol";
import { RpcCallTerminalTypeEnum } from "../../src/protocol";
import {
	admitEmptySession,
	batchDescriptor,
	createAcceptorHarness,
} from "./mutation/test.utils";

describe("Acceptor mutation batches", () => {
	it("RPC-API-005 commits the full F snapshot before notifications and settles the close task last", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		const { acceptor, host } = createAcceptorHarness({
			close: () => {
				finishInvocation?.({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		});
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return { start() {}, cancel() {} };
			},
			forceClose() {},
		};
		if (host.admitSession(session) === undefined) {
			throw new Error("Expected the Acceptor Session to be admitted.");
		}
		const peer = acceptor.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Acceptor peer.");
		}

		let callSettled = false;
		let closeSettled = false;
		const order: string[] = [];
		const closingObservations: {
			readonly source: string;
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly memberCount: number;
			readonly callSettled: boolean;
			readonly closeSettled: boolean;
		}[] = [];
		const observeClosing = (source: string): void => {
			closingObservations.push({
				source,
				ownerStatus: acceptor.state.status,
				peerStatus: peer.state.status,
				memberCount: acceptor.peers.length,
				callSettled,
				closeSettled,
			});
		};
		let finalStateObservation:
			| {
					readonly ownerStatus: string;
					readonly peerStatus: string;
					readonly memberCount: number;
					readonly closeSettled: boolean;
			  }
			| undefined;
		acceptor.state$.subscribe((state) => {
			if (state.status === "closing") {
				observeClosing("owner-state");
			} else if (state.status === "closed") {
				finalStateObservation = {
					ownerStatus: acceptor.state.status,
					peerStatus: peer.state.status,
					memberCount: acceptor.peers.length,
					closeSettled,
				};
			}
		});
		acceptor.peers$.subscribe((peers) => {
			if (peers.length === 0) {
				observeClosing("peers");
			}
		});
		peer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observeClosing("peer-state");
			}
		});
		let topologyObservation:
			| {
					readonly ownerStatus: string;
					readonly peerStatus: string;
					readonly memberCount: number;
					readonly closeSettled: boolean;
			  }
			| undefined;
		acceptor.event$.subscribe((event) => {
			if (
				event.type === "call-finished" ||
				event.type === "peer-closed" ||
				event.type === "owner-closing"
			) {
				order.push(event.type);
				observeClosing(event.type);
			} else if (event.type === "topology-closed") {
				order.push(event.type);
				topologyObservation = {
					ownerStatus: acceptor.state.status,
					peerStatus: peer.state.status,
					memberCount: acceptor.peers.length,
					closeSettled,
				};
			}
		});
		const callOutcome = peer
			.resolve(batchDescriptor)
			.wait()
			.then(
				() => undefined,
				(error: unknown) => {
					callSettled = true;
					order.push("call-promise");
					return error;
				},
			);

		const closeOutcome = acceptor.close().then(() => {
			closeSettled = true;
			order.push("close-promise");
		});

		const expectedClosingSnapshot = {
			ownerStatus: "closing",
			peerStatus: "closed",
			memberCount: 0,
			callSettled: false,
			closeSettled: false,
		};
		expect(closingObservations).toEqual([
			{ source: "call-finished", ...expectedClosingSnapshot },
			{ source: "owner-state", ...expectedClosingSnapshot },
			{ source: "peers", ...expectedClosingSnapshot },
			{ source: "peer-state", ...expectedClosingSnapshot },
			{ source: "peer-closed", ...expectedClosingSnapshot },
			{ source: "owner-closing", ...expectedClosingSnapshot },
		]);
		await expect(callOutcome).resolves.toMatchObject({
			code: "outcome-unknown",
		});
		await closeOutcome;

		expect(finalStateObservation).toEqual({
			ownerStatus: "closed",
			peerStatus: "closed",
			memberCount: 0,
			closeSettled: false,
		});
		expect(topologyObservation).toEqual({
			ownerStatus: "closed",
			peerStatus: "closed",
			memberCount: 0,
			closeSettled: false,
		});
		expect(order.indexOf("call-finished")).toBeLessThan(
			order.indexOf("peer-closed"),
		);
		expect(order.indexOf("peer-closed")).toBeLessThan(
			order.indexOf("topology-closed"),
		);
		expect(order.indexOf("peer-closed")).toBeLessThan(
			order.indexOf("call-promise"),
		);
		expect(order.indexOf("topology-closed")).toBeLessThan(
			order.indexOf("close-promise"),
		);
	});

	it("RPC-API-005 RPC-SPI-011 batches a shared owner fault after closing the runtime", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let acceptorDuringRuntimeClose:
			| {
					readonly ownerStatus: string;
					readonly memberCount: number;
			  }
			| undefined;
		let acceptor: IRpcAcceptor | undefined;
		const harness = createAcceptorHarness({
			close: () => {
				acceptorDuringRuntimeClose = {
					ownerStatus: acceptor?.state.status ?? "missing",
					memberCount: acceptor?.peers.length ?? -1,
				};
				finishInvocation?.({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		});
		acceptor = harness.acceptor;
		const firstSession: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return { start() {}, cancel() {} };
			},
			forceClose() {},
		};
		if (harness.host.admitSession(firstSession) === undefined) {
			throw new Error("Expected the first Acceptor Session to be admitted.");
		}
		admitEmptySession(harness.host);
		const [firstPeer, secondPeer] = acceptor.peers;
		if (firstPeer === undefined || secondPeer === undefined) {
			throw new Error("Expected two admitted Acceptor peers.");
		}
		const observations: {
			readonly source: string;
			readonly ownerStatus: string;
			readonly memberCount: number;
			readonly firstPeerStatus: string;
			readonly secondPeerStatus: string;
			readonly callSettled: boolean;
		}[] = [];
		let callSettled = false;
		const observe = (source: string): void => {
			observations.push({
				source,
				ownerStatus: acceptor?.state.status ?? "missing",
				memberCount: acceptor?.peers.length ?? -1,
				firstPeerStatus: firstPeer.state.status,
				secondPeerStatus: secondPeer.state.status,
				callSettled,
			});
		};
		acceptor.state$.subscribe((state) => {
			if (state.status === "closing") {
				observe("owner-state");
			}
		});
		acceptor.peers$.subscribe((peers) => {
			if (peers.length === 0) {
				observe("peers");
			}
		});
		firstPeer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observe("first-peer-state");
			}
		});
		secondPeer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observe("second-peer-state");
			}
		});
		acceptor.event$.subscribe((event) => {
			if (event.type === "call-finished") {
				observe("call-finished");
			} else if (event.type === "peer-closed") {
				observe(
					event.peer === firstPeer ? "first-peer-closed" : "second-peer-closed",
				);
			} else if (event.type === "owner-closing") {
				observe("owner-closing");
			}
		});
		const callOutcome = firstPeer
			.resolve(batchDescriptor)
			.wait()
			.then(
				() => undefined,
				(error: unknown) => {
					callSettled = true;
					return error;
				},
			);

		harness.host.fault(
			RpcCloseReasonEnum.protocolFault,
			new Error("shared fault"),
		);

		expect(acceptorDuringRuntimeClose).toEqual({
			ownerStatus: "active",
			memberCount: 2,
		});
		const expectedSnapshot = {
			ownerStatus: "closing",
			memberCount: 0,
			firstPeerStatus: "closed",
			secondPeerStatus: "closed",
			callSettled: false,
		};
		expect(observations).toEqual([
			{ source: "call-finished", ...expectedSnapshot },
			{ source: "owner-state", ...expectedSnapshot },
			{ source: "peers", ...expectedSnapshot },
			{ source: "first-peer-state", ...expectedSnapshot },
			{ source: "second-peer-state", ...expectedSnapshot },
			{ source: "first-peer-closed", ...expectedSnapshot },
			{ source: "second-peer-closed", ...expectedSnapshot },
			{ source: "owner-closing", ...expectedSnapshot },
		]);
		await expect(callOutcome).resolves.toMatchObject({
			code: RpcExceptionCodeEnum.outcomeUnknown,
		});
		await acceptor.close();
	});
});
