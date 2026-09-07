/**
 * @overview Internal RPC protocol size limit constants.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

/**
 * Wire identifiers must be non-empty so peer-visible names cannot collapse into
 * an omitted or default identity.
 */
export const RPC_WIRE_IDENTIFIER_MIN_LENGTH = 1;

/**
 * Human-authored service and method names stay small, while oversized untrusted
 * names are rejected before becoming protocol metadata.
 */
export const RPC_WIRE_IDENTIFIER_MAX_LENGTH = 128;
