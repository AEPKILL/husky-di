/**
 * @overview Web Crypto handshake proofs for husky-di-rpc/1 Sessions.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RPC_PROFILE } from "@/constants/protocol/rpc-profile.const";
import { RpcProofOperationKindEnum } from "@/enums/protocol/rpc-proof-operation-kind.enum";
import type {
	IRpcHandshakeCryptography,
	SignRpcProofOptions,
	VerifyRpcProofOptions,
} from "@/interfaces/protocol/rpc-handshake-cryptography.interface";
import type {
	RpcFreshAccept,
	RpcFreshRequest,
	RpcJsonRecord,
	RpcJsonValue,
	RpcResumeRequest,
} from "@/types/protocol/rpc-wire-record.type";
import { rpcBase64Url32Schema } from "@/utils/protocol/rpc-base64-url-32-schema.util";
import { canonicalizeRpcJson } from "@/utils/protocol/rpc-json-canonicalization.util";

export class RpcHandshakeCryptographyImpl
	implements IRpcHandshakeCryptography<CryptoKey>
{
	public createSecurityCarrier(): string {
		return createRpcSecurityCarrier();
	}

	public async deriveProofKey(
		sessionSecret: string,
		sessionId: string,
	): Promise<CryptoKey> {
		return deriveRpcProofKey(decodeRpcBase64Url32(sessionSecret), sessionId);
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
}

const textEncoder = new TextEncoder();

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
	return digest(textEncoder.encode(canonicalizeRpcJson(record)));
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
	let keyData: ArrayBuffer | undefined;
	try {
		keyData = toArrayBuffer(bytes);
		return await getWebCrypto().subtle.importKey(
			"raw",
			keyData,
			{ name: "HMAC", hash: "SHA-256", length: 256 },
			false,
			["sign", "verify"],
		);
	} finally {
		bytes.fill(0);
		if (keyData !== undefined) {
			new Uint8Array(keyData).fill(0);
		}
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

function createRandomBytes(): Uint8Array {
	return getWebCrypto().getRandomValues(new Uint8Array(32));
}

function createRpcSecurityCarrier(): string {
	const bytes = createRandomBytes();
	try {
		return encodeBase64Url(bytes);
	} finally {
		bytes.fill(0);
	}
}

function decodeRpcBase64Url32(value: string): Uint8Array {
	if (!rpcBase64Url32Schema.safeParse(value).success) {
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
		bytes.fill(0);
		throw new Error("RPC security carrier has an alternate spelling.");
	}
	return bytes;
}

async function deriveRpcProofKey(
	sessionSecret: Uint8Array,
	sessionId: string,
): Promise<CryptoKey> {
	let keyData: ArrayBuffer | undefined;
	let crypto: Crypto;
	let rootKey: CryptoKey;
	try {
		keyData = toArrayBuffer(sessionSecret);
		crypto = getWebCrypto();
		rootKey = await crypto.subtle.importKey("raw", keyData, "HKDF", false, [
			"deriveKey",
		]);
	} finally {
		sessionSecret.fill(0);
		if (keyData !== undefined) {
			new Uint8Array(keyData).fill(0);
		}
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
	const dummyKey = await importHmacKey(createRandomBytes());
	return signHmac(
		dummyKey,
		await createResumeOutcomeTranscript(
			RpcProofOperationKindEnum.resumeReject,
			request,
			reject,
		),
	);
}
