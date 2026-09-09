/**
 * @overview Creates and validates husky-di-rpc/1 Base64Url32 security carriers.
 * @author AEPKILL
 * @created 2026-08-26 11:36:44
 */

import { z } from "zod";

export { rpcBase64Url32Schema };

/** Returns one canonical Base64Url32 value from platform CSPRNG bytes. */
export function createRpcSecurityCarrier(): string {
	const crypto = globalThis.crypto;
	if (crypto === undefined) {
		throw new Error("The Default RPC Protocol requires Web Crypto.");
	}
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	try {
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		return btoa(binary)
			.replaceAll("+", "-")
			.replaceAll("/", "_")
			.replace(/=+$/u, "");
	} finally {
		bytes.fill(0);
	}
}

/** Compares canonical carriers without data-dependent early exit. */
export function rpcSecurityCarriersEqual(left: string, right: string): boolean {
	let difference = left.length ^ right.length;
	for (let index = 0; index < base64Url32Length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

const base64Url32Pattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const base64Url32Length = 43;
const rpcBase64Url32Schema = z.string().regex(base64Url32Pattern);
