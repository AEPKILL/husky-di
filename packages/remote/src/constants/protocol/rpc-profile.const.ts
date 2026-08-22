/**
 * @overview Private identifier and numeric limits for the husky-di-rpc/1 profile.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export const RPC_MAX_MESSAGE_BYTES = 1_048_576;
export const RPC_PROFILE = "husky-di-rpc/1";
// An ACK-bearing Error.details record is the largest fixed Application wrapper.
export const RPC_MAX_WIRE_DEPTH = 64 + 3;
export const RPC_MAX_WIRE_NODES = 65_536 + 10;
export const RPC_MAX_INGRESS_RECORDS = 64;
export const RPC_MAX_INGRESS_BYTES = 8 * 1024 * 1024;
export const RPC_PROTECTED_SESSION_BYTES = 512 * 1024;
