/**
 * @overview Web Crypto transcript helpers for husky-di-rpc/1 Session proof keys.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { DEFAULT_RPC_PROFILE_ID } from "@/protocols/default/default-rpc-profile.const";
import type {
	DefaultRpcFreshAccept,
	DefaultRpcFreshRequest,
	DefaultRpcJsonRecord,
	DefaultRpcJsonValue,
	DefaultRpcResumeAccept,
	DefaultRpcResumeReject,
	DefaultRpcResumeRequest,
} from "@/protocols/default/default-rpc-record.type";

const textEncoder = new TextEncoder();
const base64Url32Pattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

function getWebCrypto(): Crypto {
	const crypto = globalThis.crypto;
	if (crypto?.subtle === undefined) {
		throw new Error("The Default RPC Protocol requires Web Crypto.");
	}
	return crypto;
}

function encodeBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}

function concatenate(...parts: readonly Uint8Array[]): Uint8Array {
	const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
	const result = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.byteLength;
	}
	return result;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

function canonicalize(value: DefaultRpcJsonValue): string {
	if (value === null || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (typeof value === "string" || typeof value === "number") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalize(item)).join(",")}]`;
	}
	const record = value as DefaultRpcJsonRecord;
	return `{${Object.keys(record)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${canonicalize(record[key] as DefaultRpcJsonValue)}`,
		)
		.join(",")}}`;
}

function withoutTopLevelProof(
	record: DefaultRpcJsonRecord,
): DefaultRpcJsonRecord {
	const result = Object.create(null) as Record<string, DefaultRpcJsonValue>;
	for (const key of Object.keys(record)) {
		if (key !== "proof") {
			result[key] = record[key] as DefaultRpcJsonValue;
		}
	}
	return result;
}

async function digest(value: Uint8Array): Promise<Uint8Array> {
	return new Uint8Array(
		await getWebCrypto().subtle.digest("SHA-256", toArrayBuffer(value)),
	);
}

async function hashRecord(record: DefaultRpcJsonRecord): Promise<Uint8Array> {
	return digest(textEncoder.encode(canonicalize(record)));
}

function domain(label: string): Uint8Array {
	return textEncoder.encode(`${DEFAULT_RPC_PROFILE_ID}\0${label}\0`);
}

async function createFreshAcceptTranscript(
	request: DefaultRpcFreshRequest,
	accept: DefaultRpcFreshAccept | DefaultRpcJsonRecord,
): Promise<Uint8Array> {
	const requestHash = await hashRecord(request);
	const acceptHash = await hashRecord(withoutTopLevelProof(accept));
	return concatenate(domain("fresh-accept"), requestHash, acceptHash);
}

async function createResumeRequestTranscript(
	request: DefaultRpcJsonRecord,
): Promise<Uint8Array> {
	return concatenate(
		domain("resume-request"),
		await hashRecord(withoutTopLevelProof(request)),
	);
}

async function createResumeOutcomeTranscript(
	label: "resume-accept" | "resume-reject",
	request: DefaultRpcResumeRequest,
	outcome: DefaultRpcJsonRecord,
): Promise<Uint8Array> {
	const requestHash = await hashRecord(withoutTopLevelProof(request));
	const outcomeHash = await hashRecord(withoutTopLevelProof(outcome));
	return concatenate(domain(label), requestHash, outcomeHash);
}

async function importHmacKey(bytes: Uint8Array): Promise<CryptoKey> {
	try {
		return await getWebCrypto().subtle.importKey(
			"raw",
			toArrayBuffer(bytes),
			{ name: "HMAC", hash: "SHA-256", length: 256 },
			false,
			["sign", "verify"],
		);
	} finally {
		bytes.fill(0);
	}
}

async function signHmac(
	proofKey: CryptoKey,
	input: Uint8Array,
): Promise<string> {
	const signature = await getWebCrypto().subtle.sign(
		"HMAC",
		proofKey,
		toArrayBuffer(input),
	);
	return encodeBase64Url(new Uint8Array(signature));
}

async function verifyHmac(
	proofKey: CryptoKey,
	proof: string,
	input: Uint8Array,
): Promise<boolean> {
	return getWebCrypto().subtle.verify(
		"HMAC",
		proofKey,
		toArrayBuffer(decodeDefaultRpcBase64Url32(proof)),
		toArrayBuffer(input),
	);
}

export function createDefaultRpcRandomCarrier(): {
	readonly bytes: Uint8Array;
	readonly value: string;
} {
	const bytes = getWebCrypto().getRandomValues(new Uint8Array(32));
	return { bytes, value: encodeBase64Url(bytes) };
}

export function decodeDefaultRpcBase64Url32(value: string): Uint8Array {
	if (!base64Url32Pattern.test(value)) {
		throw new Error("RPC security carrier is not canonical Base64Url32.");
	}
	const padded = `${value.replaceAll("-", "+").replaceAll("_", "/")}=`;
	let binary: string;
	try {
		binary = atob(padded);
	} catch {
		throw new Error("RPC security carrier cannot be decoded.");
	}
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	if (bytes.byteLength !== 32 || encodeBase64Url(bytes) !== value) {
		throw new Error("RPC security carrier has an alternate spelling.");
	}
	return bytes;
}

export async function deriveDefaultRpcProofKey(
	sessionSecret: Uint8Array,
	sessionId: string,
): Promise<CryptoKey> {
	const crypto = getWebCrypto();
	let rootKey: CryptoKey;
	try {
		rootKey = await crypto.subtle.importKey(
			"raw",
			toArrayBuffer(sessionSecret),
			"HKDF",
			false,
			["deriveKey"],
		);
	} finally {
		sessionSecret.fill(0);
	}
	const context = await hashRecord({
		profile: DEFAULT_RPC_PROFILE_ID,
		sessionId,
	});
	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: toArrayBuffer(context),
			info: toArrayBuffer(domain("proof-key")),
		},
		rootKey,
		{ name: "HMAC", hash: "SHA-256", length: 256 },
		false,
		["sign", "verify"],
	);
}

export async function signDefaultRpcFreshAccept(
	proofKey: CryptoKey,
	request: DefaultRpcFreshRequest,
	accept: DefaultRpcJsonRecord,
): Promise<string> {
	return signHmac(proofKey, await createFreshAcceptTranscript(request, accept));
}

export async function verifyDefaultRpcFreshAccept(
	proofKey: CryptoKey,
	request: DefaultRpcFreshRequest,
	accept: DefaultRpcFreshAccept,
): Promise<boolean> {
	return verifyHmac(
		proofKey,
		accept.proof,
		await createFreshAcceptTranscript(request, accept),
	);
}

export async function signDefaultRpcResumeRequest(
	proofKey: CryptoKey,
	request: DefaultRpcJsonRecord,
): Promise<string> {
	return signHmac(proofKey, await createResumeRequestTranscript(request));
}

export async function verifyDefaultRpcResumeRequest(
	proofKey: CryptoKey,
	request: DefaultRpcResumeRequest,
): Promise<boolean> {
	return verifyHmac(
		proofKey,
		request.proof,
		await createResumeRequestTranscript(request),
	);
}

export async function signDefaultRpcResumeAccept(
	proofKey: CryptoKey,
	request: DefaultRpcResumeRequest,
	accept: DefaultRpcJsonRecord,
): Promise<string> {
	return signHmac(
		proofKey,
		await createResumeOutcomeTranscript("resume-accept", request, accept),
	);
}

export async function verifyDefaultRpcResumeAccept(
	proofKey: CryptoKey,
	request: DefaultRpcResumeRequest,
	accept: DefaultRpcResumeAccept,
): Promise<boolean> {
	return verifyHmac(
		proofKey,
		accept.proof,
		await createResumeOutcomeTranscript("resume-accept", request, accept),
	);
}

export async function signDefaultRpcAuthenticatedReject(
	proofKey: CryptoKey,
	request: DefaultRpcResumeRequest,
	reject: DefaultRpcJsonRecord,
): Promise<string> {
	return signHmac(
		proofKey,
		await createResumeOutcomeTranscript("resume-reject", request, reject),
	);
}

export async function verifyDefaultRpcAuthenticatedReject(
	proofKey: CryptoKey,
	request: DefaultRpcResumeRequest,
	reject: DefaultRpcResumeReject,
): Promise<boolean> {
	return verifyHmac(
		proofKey,
		reject.proof,
		await createResumeOutcomeTranscript("resume-reject", request, reject),
	);
}

export async function createDefaultRpcGenericRejectProof(
	request: DefaultRpcResumeRequest,
	reject: DefaultRpcJsonRecord,
): Promise<string> {
	const dummyKey = await importHmacKey(createDefaultRpcRandomCarrier().bytes);
	return signHmac(
		dummyKey,
		await createResumeOutcomeTranscript("resume-reject", request, reject),
	);
}

export function canonicalizeDefaultRpcRecord(
	record: DefaultRpcJsonRecord,
): string {
	return canonicalize(record);
}
