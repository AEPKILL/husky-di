/**
 * @overview Compile-time caller and Framework boundary probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcError } from "../../src/index";

// @ts-expect-error RPC-CALL-009 keeps RpcError construction Framework-private.
const callerCreatedError = new RpcError("unavailable");
void callerCreatedError;

// @ts-expect-error RPC-BASE-003 keeps the default Codec private.
type MissingDefaultCodec = import("../../src/protocol").DefaultRpcCodec;
void (null as unknown as MissingDefaultCodec);

// @ts-expect-error RPC-POLICY-004 keeps the internal scheduler private.
type MissingRpcScheduler = import("../../src/index").RpcHandlerScheduler;
void (null as unknown as MissingRpcScheduler);
