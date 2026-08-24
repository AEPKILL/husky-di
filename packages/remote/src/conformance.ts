/**
 * @overview Framework-neutral RPC Protocol and Adapter conformance entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

/**
 * Stable Protocol case IDs:
 *
 * - `protocol.construction.immutable`
 * - `protocol.construction.connector-fresh-non-reentrant`
 * - `protocol.construction.acceptor-fresh-non-reentrant`
 * - `protocol.handoff.subscribe-before-install`
 * - `protocol.values.normalized-snapshots`
 * - `protocol.outgoing.reserve-commit-start-sink`
 * - `protocol.incoming.resource-disposition`
 * - `protocol.incoming.semantic-unknown-service`
 * - `protocol.incoming.semantic-unknown-method`
 * - `protocol.incoming.handler-dispositions-permit`
 * - `protocol.fault.active-session-scope`
 * - `protocol.counter.first-call-drains`
 * - `protocol.termination.shutdown-phase`
 * - `protocol.termination.close-phase`
 * - `protocol.termination.cleanup-cached`
 * - `protocol.stream.outgoing-lifecycle`
 * - `protocol.stream.incoming-resource-before-route`
 * - `protocol.stream.incoming-semantic-unknown-member`
 * - `protocol.stream.projection-rearm`
 * - `protocol.stream.source-reserve-before-raw`
 * - `protocol.stream.source-w1-overflow`
 * - `protocol.stream.item-before-terminal`
 * - `protocol.stream.over-credit-session-fault`
 * - `protocol.stream.terminal-teardown-release`
 * - `protocol.stream.recovery-no-resubscribe`
 * - `protocol.stream.fairness-progress`
 * - `protocol.stream.shutdown-graceful-force`
 * - `protocol.stream.aggregate-bounded-load`
 * - `protocol.receipt.terminal-direction-only`
 * - `protocol.stream.adapter-rejection-is-binding-failure`
 *
 * Stable Connector Adapter case IDs:
 *
 * - `RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.handoff.subscribe-before-start`
 * - `RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.source.multicast-terminal-single-use`
 * - `RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 connector.message.identity-order-hot-terminal`
 * - `RPC-TRANSPORT-001 RPC-TRANSPORT-003 connector.message.error-identity-terminal`
 * - `RPC-TRANSPORT-005 RPC-TRANSPORT-006 connector.send.local-admission-backpressure`
 * - `RPC-TRANSPORT-006 connector.send.one-mebibyte-compatibility`
 * - `RPC-TRANSPORT-003 RPC-TRANSPORT-007 connector.close.direct-idempotent-race`
 * - `RPC-TRANSPORT-008 connector.start.abort-before-handoff`
 * - `RPC-TRANSPORT-003 RPC-TRANSPORT-008 connector.start.failure-error-identity`
 * - `RPC-TRANSPORT-004 RPC-TRANSPORT-008 connector.start.abort-after-handoff-no-revocation`
 *
 * Stable Acceptor Adapter case IDs:
 *
 * - `RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.handoff.subscribe-before-start-early-accept`
 * - `RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 RPC-TRANSPORT-009 acceptor.source.multicast-order-hot-terminal`
 * - `RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 acceptor.message.identity-order-hot-terminal`
 * - `RPC-TRANSPORT-001 RPC-TRANSPORT-003 acceptor.message.error-identity-terminal`
 * - `RPC-TRANSPORT-005 RPC-TRANSPORT-006 acceptor.send.local-admission-backpressure`
 * - `RPC-TRANSPORT-006 acceptor.send.one-mebibyte-compatibility`
 * - `RPC-TRANSPORT-003 RPC-TRANSPORT-007 acceptor.close.direct-idempotent-race`
 * - `RPC-TRANSPORT-009 acceptor.start.abort-before-ready`
 * - `RPC-TRANSPORT-009 acceptor.start.abort-after-ready`
 * - `RPC-TRANSPORT-009 acceptor.start.complete-before-ready`
 * - `RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.start.failure-error-identity`
 * - `RPC-TRANSPORT-003 RPC-TRANSPORT-009 acceptor.listener.failure-after-ready-no-revocation`
 * - `RPC-TRANSPORT-010 acceptor.connection.failure-isolation`
 * - `RPC-TRANSPORT-007 RPC-TRANSPORT-009 RPC-TRANSPORT-011 acceptor.overflow.abort-inside-handoff`
 */
export {
	runRpcAcceptorAdapterConformance,
	runRpcConnectorAdapterConformance,
} from "@/conformance/rpc-adapter-conformance.util";
export type {
	IRpcAcceptorAdapterConformanceFixture,
	IRpcAdapterConformanceRemote,
	IRpcConnectorAdapterConformanceFixture,
	IRpcProtocolConformanceFixture,
} from "@/conformance/rpc-conformance.interface";
export type {
	RpcConformanceCaseResult,
	RpcConformanceFailure,
	RpcConformanceOptions,
	RpcConformanceReport,
} from "@/conformance/rpc-conformance.type";
export { runRpcProtocolConformance } from "@/conformance/rpc-protocol-conformance.util";
export { RpcConformanceStatusEnum } from "@/enums/conformance/rpc-conformance-status.enum";
