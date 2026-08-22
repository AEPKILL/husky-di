/**
 * @overview Web Crypto transcript helpers for husky-di-rpc/1 Session proof keys.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RPC_PROFILE } from "@/constants/protocol/rpc-profile.const";
import { RpcProofOperationKindEnum } from "@/enums/protocol/rpc-proof-operation-kind.enum";
import type { IRpcCryptography } from "@/interfaces/protocol/rpc-cryptography.interface";
import type {
	SignRpcProofOptions,
	VerifyRpcProofOptions,
} from "@/types/protocol/rpc-cryptography.type";
import type {
	RpcFreshAccept,
	RpcFreshRequest,
	RpcJsonRecord,
	RpcJsonValue,
	RpcResumeRequest,
} from "@/types/protocol/rpc-wire-record.type";

export class RpcCryptographyImpl implements IRpcCryptography<CryptoKey> {
	public createRandomCarrier(): {
		readonly bytes: Uint8Array;
		readonly value: string;
	} {
		return createRpcRandomCarrier();
	}

	public decodeBase64Url32(value: string): Uint8Array {
		return decodeRpcBase64Url32(value);
	}

	public deriveProofKey(
		sessionSecret: Uint8Array,
		sessionId: string,
	): Promise<CryptoKey> {
		return deriveRpcProofKey(sessionSecret, sessionId);
	}

	public async signProof(
		options: SignRpcProofOptions<CryptoKey>,
	): Promise<string> {
		switch (options.kind) {
			case RpcProofOperationKindEnum.freshAccept:
				return signHmac(
					options.proofKey,
					await createFreshAcceptTranscript(options.request, options.record),
				);
			case RpcProofOperationKindEnum.resumeRequest:
				return signHmac(
					options.proofKey,
					await createResumeRequestTranscript(options.record),
				);
			case RpcProofOperationKindEnum.resumeAccept:
				return signHmac(
					options.proofKey,
					await createResumeOutcomeTranscript(
						RpcProofOperationKindEnum.resumeAccept,
						options.request,
						options.record,
					),
				);
			case RpcProofOperationKindEnum.resumeReject:
				return signHmac(
					options.proofKey,
					await createResumeOutcomeTranscript(
						RpcProofOperationKindEnum.resumeReject,
						options.request,
						options.record,
					),
				);
			default:
				return createRpcGenericRejectProof(options.request, options.record);
		}
	}

	public async verifyProof(
		options: VerifyRpcProofOptions<CryptoKey>,
	): Promise<boolean> {
		switch (options.kind) {
			case RpcProofOperationKindEnum.freshAccept:
				return verifyHmac(
					options.proofKey,
					options.record.proof,
					await createFreshAcceptTranscript(options.request, options.record),
				);
			case RpcProofOperationKindEnum.resumeRequest:
				return verifyHmac(
					options.proofKey,
					options.request.proof,
					await createResumeRequestTranscript(options.request),
				);
			case RpcProofOperationKindEnum.resumeAccept:
				return verifyHmac(
					options.proofKey,
					options.record.proof,
					await createResumeOutcomeTranscript(
						RpcProofOperationKindEnum.resumeAccept,
						options.request,
						options.record,
					),
				);
			default:
				return verifyHmac(
					options.proofKey,
					options.record.proof,
					await createResumeOutcomeTranscript(
						RpcProofOperationKindEnum.resumeReject,
						options.request,
						options.record,
					),
				);
		}
	}

	public canonicalize(record: RpcJsonRecord): string {
		return canonicalize(record);
	}
}

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

function canonicalize(value: RpcJsonValue): string {
	if (value === null || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (typeof value === "string" || typeof value === "number") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalize(item)).join(",")}]`;
	}
	const record = value as RpcJsonRecord;
	return `{${Object.keys(record)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${canonicalize(record[key] as RpcJsonValue)}`,
		)
		.join(",")}}`;
}

function withoutTopLevelProof(record: RpcJsonRecord): RpcJsonRecord {
	const result = Object.create(null) as Record<string, RpcJsonValue>;
	for (const key of Object.keys(record)) {
		if (key !== "proof") {
			result[key] = record[key] as RpcJsonValue;
		}
	}
	return result;
}

async function digest(value: Uint8Array): Promise<Uint8Array> {
	return new Uint8Array(
		await getWebCrypto().subtle.digest("SHA-256", toArrayBuffer(value)),
	);
}

async function hashRecord(record: RpcJsonRecord): Promise<Uint8Array> {
	return digest(textEncoder.encode(canonicalize(record)));
}

function domain(label: string): Uint8Array {
	return textEncoder.encode(`${RPC_PROFILE}\0${label}\0`);
}

async function createFreshAcceptTranscript(
	request: RpcFreshRequest,
	accept: RpcFreshAccept | RpcJsonRecord,
): Promise<Uint8Array> {
	const requestHash = await hashRecord(request);
	const acceptHash = await hashRecord(withoutTopLevelProof(accept));
	return concatenate(
		domain(RpcProofOperationKindEnum.freshAccept),
		requestHash,
		acceptHash,
	);
}

async function createResumeRequestTranscript(
	request: RpcJsonRecord,
): Promise<Uint8Array> {
	return concatenate(
		domain(RpcProofOperationKindEnum.resumeRequest),
		await hashRecord(withoutTopLevelProof(request)),
	);
}

async function createResumeOutcomeTranscript(
	label:
		| RpcProofOperationKindEnum.resumeAccept
		| RpcProofOperationKindEnum.resumeReject,
	request: RpcResumeRequest,
	outcome: RpcJsonRecord,
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
		toArrayBuffer(decodeRpcBase64Url32(proof)),
		toArrayBuffer(input),
	);
}

function createRpcRandomCarrier(): {
	readonly bytes: Uint8Array;
	readonly value: string;
} {
	const bytes = getWebCrypto().getRandomValues(new Uint8Array(32));
	return { bytes, value: encodeBase64Url(bytes) };
}

function decodeRpcBase64Url32(value: string): Uint8Array {
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

async function deriveRpcProofKey(
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
		profile: RPC_PROFILE,
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

async function createRpcGenericRejectProof(
	request: RpcResumeRequest,
	reject: RpcJsonRecord,
): Promise<string> {
	const dummyKey = await importHmacKey(createRpcRandomCarrier().bytes);
	return signHmac(
		dummyKey,
		await createResumeOutcomeTranscript(
			RpcProofOperationKindEnum.resumeReject,
			request,
			reject,
		),
	);
}
