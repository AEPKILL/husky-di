/**
 * @overview Compile-time caller and Framework boundary probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcEventDirectionEnum, RpcEventTypeEnum } from "../../src/index";

// @ts-expect-error RPC-BASE-003 keeps the Codec interface private.
type MissingRpcCodec = import("../../src/protocol").IRpcCodec;
void (null as unknown as MissingRpcCodec);

// @ts-expect-error RPC-POLICY-004 keeps the internal scheduler private.
type MissingRpcScheduler = import("../../src/index").RpcHandlerSchedulerImpl;
void (null as unknown as MissingRpcScheduler);

// @ts-expect-error RPC-API-007 removes RpcPeerResult from the root.
type MissingRpcPeerResult = import("../../src/index").RpcPeerResult;
void (null as unknown as MissingRpcPeerResult);

// @ts-expect-error RPC-API-007 removes RemoteServiceGroup from the root.
type MissingRemoteServiceGroup = import("../../src/index").RemoteServiceGroup;
void (null as unknown as MissingRemoteServiceGroup);

// @ts-expect-error RPC-EVENT-010 removes the call-only direction enum.
type MissingDirection = import("../../src/index").RpcCallDirectionEnum;
void (null as unknown as MissingDirection);

declare const event: import("../../src/index").RpcEvent;
if (
	event.type === RpcEventTypeEnum.streamFinished &&
	event.direction === RpcEventDirectionEnum.outgoing
) {
	event.deliveredItemCount;
	// @ts-expect-error RPC-EVENT-010 keeps outgoing and incoming counts distinct.
	event.admittedItemCount;
	// @ts-expect-error RPC-EVENT-018 keeps the teardown incident Source-only.
	event.sourceTeardownFailed;
}
if (
	event.type === RpcEventTypeEnum.streamFinished &&
	event.direction === RpcEventDirectionEnum.incoming
) {
	event.admittedItemCount;
	// @ts-expect-error RPC-EVENT-010 keeps outgoing and incoming counts distinct.
	event.deliveredItemCount;
}

declare const acceptor: import("../../src/index").IRpcAcceptor;
// @ts-expect-error RPC-API-007 removes resolveAll from IRpcAcceptor.
acceptor.resolveAll;
