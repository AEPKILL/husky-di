/**
 * @overview Bounded RFC 8259 Codec and record validation for husky-di-rpc/1.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcApplicationValue } from "@/interfaces/rpc-protocol.interface";
import {
	DEFAULT_RPC_MAX_MESSAGE_BYTES,
	DEFAULT_RPC_PROFILE_ID,
} from "@/protocols/default/default-rpc-profile.const";
import type {
	DefaultRpcAckRecord,
	DefaultRpcActiveRecord,
	DefaultRpcCallMessage,
	DefaultRpcCancelMessage,
	DefaultRpcControlRecord,
	DefaultRpcErrorMessage,
	DefaultRpcFreshAccept,
	DefaultRpcFreshRequest,
	DefaultRpcJsonRecord,
	DefaultRpcJsonValue,
	DefaultRpcMessageEnvelope,
	DefaultRpcResultMessage,
	DefaultRpcResumeAccept,
	DefaultRpcResumeOutcome,
	DefaultRpcResumeReject,
	DefaultRpcResumeRejectCode,
	DefaultRpcResumeRequest,
	DefaultRpcSemanticMessage,
	DefaultRpcWireErrorCode,
} from "@/protocols/default/default-rpc-record.type";

const textDecoder = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true,
});
const textEncoder = new TextEncoder();
const base64Url32Pattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const callOrdinalPattern = /^(?:[1-9][0-9]{0,15})$/;
const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const wireErrorCodes = new Set<DefaultRpcWireErrorCode>([
	"canceled",
	"unavailable",
	"handler-failed",
	"unknown-service",
	"unknown-method",
]);
const resumeRejectCodes = new Set<DefaultRpcResumeRejectCode>([
	"resume-rejected",
	"continuity-failure",
	"session-terminated",
]);
const closeForbiddenMembers = new Set([
	"seq",
	"ackThrough",
	"profile",
	"profiles",
	"sessionId",
	"bindingEpoch",
	"resumeAttempt",
	"receivedThrough",
	"initiatorNonce",
	"responderNonce",
	"sessionSecret",
	"proof",
	"callId",
	"service",
	"method",
	"args",
	"value",
	"error",
	"code",
	"message",
	"reason",
]);

type MutableJsonRecord = Record<string, DefaultRpcJsonValue>;

class BoundedJsonParser {
	readonly _text: string;
	_index = 0;
	_nodes = 0;

	constructor(text: string) {
		this._text = text;
	}

	parse(): DefaultRpcJsonRecord {
		if (this._text.charCodeAt(0) === 0xfeff) {
			throw new Error("RPC JSON must not start with a BOM.");
		}
		this._skipWhitespace();
		const value = this._parseValue(1);
		this._skipWhitespace();
		if (this._index !== this._text.length) {
			throw new Error("RPC JSON contains trailing data.");
		}
		if (!isJsonRecord(value)) {
			throw new Error("RPC JSON root must be an object.");
		}
		return value;
	}

	_parseValue(depth: number): DefaultRpcJsonValue {
		if (depth > 64) {
			throw new Error("RPC JSON exceeds the depth limit.");
		}
		this._nodes += 1;
		if (this._nodes > 65_536) {
			throw new Error("RPC JSON exceeds the node limit.");
		}

		const character = this._text[this._index];
		if (character === "{") {
			return this._parseObject(depth);
		}
		if (character === "[") {
			return this._parseArray(depth);
		}
		if (character === '"') {
			return this._parseString(524_288, "string");
		}
		if (character === "t") {
			this._consumeLiteral("true");
			return true;
		}
		if (character === "f") {
			this._consumeLiteral("false");
			return false;
		}
		if (character === "n") {
			this._consumeLiteral("null");
			return null;
		}
		return this._parseNumber();
	}

	_parseObject(depth: number): DefaultRpcJsonRecord {
		this._index += 1;
		this._skipWhitespace();
		const result = Object.create(null) as MutableJsonRecord;
		const names = new Set<string>();
		if (this._text[this._index] === "}") {
			this._index += 1;
			return result;
		}

		for (let memberCount = 1; ; memberCount += 1) {
			if (memberCount > 1_024) {
				throw new Error("RPC JSON object exceeds the member limit.");
			}
			if (this._text[this._index] !== '"') {
				throw new Error("RPC JSON object member name is missing.");
			}
			const name = this._parseString(256, "member name");
			if (names.has(name)) {
				throw new Error("RPC JSON contains a duplicate object member.");
			}
			names.add(name);
			this._skipWhitespace();
			if (this._text[this._index] !== ":") {
				throw new Error("RPC JSON object member is missing a colon.");
			}
			this._index += 1;
			this._skipWhitespace();
			result[name] = this._parseValue(depth + 1);
			this._skipWhitespace();
			const separator = this._text[this._index];
			this._index += 1;
			if (separator === "}") {
				return result;
			}
			if (separator !== ",") {
				throw new Error("RPC JSON object has an invalid separator.");
			}
			this._skipWhitespace();
		}
	}

	_parseArray(depth: number): readonly DefaultRpcJsonValue[] {
		this._index += 1;
		this._skipWhitespace();
		const result: DefaultRpcJsonValue[] = [];
		if (this._text[this._index] === "]") {
			this._index += 1;
			return result;
		}

		for (;;) {
			if (result.length >= 8_192) {
				throw new Error("RPC JSON array exceeds the element limit.");
			}
			result.push(this._parseValue(depth + 1));
			this._skipWhitespace();
			const separator = this._text[this._index];
			this._index += 1;
			if (separator === "]") {
				return result;
			}
			if (separator !== ",") {
				throw new Error("RPC JSON array has an invalid separator.");
			}
			this._skipWhitespace();
		}
	}

	_parseString(maximumBytes: number, label: string): string {
		const start = this._index;
		this._index += 1;
		for (;;) {
			const code = this._text.charCodeAt(this._index);
			if (Number.isNaN(code)) {
				throw new Error(`RPC JSON ${label} is unterminated.`);
			}
			if (code === 0x22) {
				this._index += 1;
				break;
			}
			if (code < 0x20) {
				throw new Error(`RPC JSON ${label} contains a control character.`);
			}
			if (code === 0x5c) {
				this._index += 1;
				const escapeCharacter = this._text[this._index];
				if (escapeCharacter === "u") {
					const digits = this._text.slice(this._index + 1, this._index + 5);
					if (!/^[0-9a-fA-F]{4}$/.test(digits)) {
						throw new Error(`RPC JSON ${label} has an invalid escape.`);
					}
					this._index += 5;
					continue;
				}
				if (
					escapeCharacter === undefined ||
					!'"\\/bfnrt'.includes(escapeCharacter)
				) {
					throw new Error(`RPC JSON ${label} has an invalid escape.`);
				}
			}
			this._index += 1;
		}

		const decoded = JSON.parse(this._text.slice(start, this._index)) as string;
		validatePairedSurrogates(decoded, label);
		if (textEncoder.encode(decoded).byteLength > maximumBytes) {
			throw new Error(`RPC JSON ${label} exceeds its byte limit.`);
		}
		return decoded;
	}

	_parseNumber(): number {
		numberPattern.lastIndex = this._index;
		const match = numberPattern.exec(this._text);
		if (match === null) {
			throw new Error("RPC JSON contains an invalid value.");
		}
		this._index = numberPattern.lastIndex;
		const value = Number(match[0]);
		if (!Number.isFinite(value) || Object.is(value, -0)) {
			throw new Error("RPC JSON number is outside the profile domain.");
		}
		return value;
	}

	_consumeLiteral(literal: string): void {
		if (
			this._text.slice(this._index, this._index + literal.length) !== literal
		) {
			throw new Error("RPC JSON contains an invalid literal.");
		}
		this._index += literal.length;
	}

	_skipWhitespace(): void {
		while (
			this._text[this._index] === " " ||
			this._text[this._index] === "\n" ||
			this._text[this._index] === "\r" ||
			this._text[this._index] === "\t"
		) {
			this._index += 1;
		}
	}
}

function validatePairedSurrogates(value: string, label: string): void {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code >= 0xd800 && code <= 0xdbff) {
			const next = value.charCodeAt(index + 1);
			if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
				throw new Error(`RPC JSON ${label} contains an unpaired surrogate.`);
			}
			index += 1;
		} else if (code >= 0xdc00 && code <= 0xdfff) {
			throw new Error(`RPC JSON ${label} contains an unpaired surrogate.`);
		}
	}
}

function isJsonRecord(
	value: DefaultRpcJsonValue,
): value is DefaultRpcJsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(record: DefaultRpcJsonRecord, key: string): boolean {
	return Object.getOwnPropertyDescriptor(record, key) !== undefined;
}

function readString(record: DefaultRpcJsonRecord, key: string): string {
	const value = record[key];
	if (typeof value !== "string") {
		throw new Error(`RPC record ${key} must be a string.`);
	}
	return value;
}

function readIdentifier(record: DefaultRpcJsonRecord, key: string): string {
	const value = readString(record, key);
	if (value.length === 0 || textEncoder.encode(value).byteLength > 256) {
		throw new Error(`RPC record ${key} is not a valid identifier.`);
	}
	return value;
}

function readBase64Url32(record: DefaultRpcJsonRecord, key: string): string {
	const value = readString(record, key);
	if (!base64Url32Pattern.test(value)) {
		throw new Error(`RPC record ${key} is not canonical Base64Url32.`);
	}
	return value;
}

function readSequence(record: DefaultRpcJsonRecord, key: string): number {
	const value = record[key];
	if (!Number.isSafeInteger(value) || (value as number) < 1) {
		throw new Error(`RPC record ${key} must be a positive safe integer.`);
	}
	return value as number;
}

function readAckCursor(record: DefaultRpcJsonRecord, key: string): number {
	const value = record[key];
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new Error(`RPC record ${key} must be a non-negative safe integer.`);
	}
	return value as number;
}

function readCallId(record: DefaultRpcJsonRecord): string {
	const value = readString(record, "callId");
	if (!callOrdinalPattern.test(value)) {
		throw new Error("RPC callId must be a canonical Call Ordinal.");
	}
	const ordinal = Number(value);
	if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
		throw new Error("RPC callId exceeds the safe-integer domain.");
	}
	return value;
}

function validateSemanticMessage(
	value: DefaultRpcJsonValue | undefined,
): DefaultRpcSemanticMessage {
	if (value === undefined || !isJsonRecord(value)) {
		throw new Error("RPC semantic message must be an object.");
	}
	const kind = readString(value, "kind");
	readCallId(value);
	if (kind === "call") {
		readIdentifier(value, "service");
		const method = readIdentifier(value, "method");
		if (method === "then") {
			throw new Error("RPC wire method then is reserved.");
		}
		if (!Array.isArray(value.args)) {
			throw new Error("RPC call args must be an array.");
		}
		return value as DefaultRpcCallMessage;
	}
	if (kind === "cancel") {
		return value as DefaultRpcCancelMessage;
	}
	if (kind === "result") {
		return value as DefaultRpcResultMessage;
	}
	if (kind === "error") {
		if (!isJsonRecord(value.error)) {
			throw new Error("RPC error payload must be an object.");
		}
		for (const key of Object.keys(value.error)) {
			if (key !== "code" && key !== "message" && key !== "details") {
				throw new Error("RPC error payload contains an unknown member.");
			}
		}
		const code = readString(value.error, "code");
		if (!wireErrorCodes.has(code as DefaultRpcWireErrorCode)) {
			throw new Error("RPC error code is outside the profile union.");
		}
		readString(value.error, "message");
		return value as DefaultRpcErrorMessage;
	}
	throw new Error("RPC semantic message kind is unknown.");
}

export function encodeDefaultRpcRecord(
	record: DefaultRpcJsonRecord,
): Uint8Array {
	const encoded = textEncoder.encode(JSON.stringify(record));
	if (encoded.byteLength > DEFAULT_RPC_MAX_MESSAGE_BYTES) {
		throw new Error("RPC record exceeds the Transport message limit.");
	}
	return encoded;
}

export function decodeDefaultRpcRecord(
	bytes: Uint8Array,
): DefaultRpcJsonRecord {
	if (bytes.byteLength > DEFAULT_RPC_MAX_MESSAGE_BYTES) {
		throw new Error("RPC Transport message exceeds the profile limit.");
	}
	let text: string;
	try {
		text = textDecoder.decode(bytes);
	} catch {
		throw new Error("RPC Transport message is not valid UTF-8.");
	}
	return new BoundedJsonParser(text).parse();
}

export function readDefaultRpcRecordKind(record: DefaultRpcJsonRecord): string {
	return readString(record, "kind");
}

export function validateDefaultRpcFreshRequest(
	record: DefaultRpcJsonRecord,
): DefaultRpcFreshRequest {
	if (readDefaultRpcRecordKind(record) !== "fresh") {
		throw new Error("The first initiator record must be fresh or resume.");
	}
	if (!Array.isArray(record.profiles) || record.profiles.length === 0) {
		throw new Error("RPC fresh profiles must be a non-empty array.");
	}
	const profiles = new Set<string>();
	for (const profile of record.profiles) {
		if (
			typeof profile !== "string" ||
			profile.length === 0 ||
			textEncoder.encode(profile).byteLength > 256 ||
			profiles.has(profile)
		) {
			throw new Error("RPC fresh profile offer is invalid.");
		}
		profiles.add(profile);
	}
	readBase64Url32(record, "initiatorNonce");
	return record as DefaultRpcFreshRequest;
}

export function validateDefaultRpcFreshAccept(
	record: DefaultRpcJsonRecord,
): DefaultRpcFreshAccept {
	if (readDefaultRpcRecordKind(record) !== "accept") {
		throw new Error("RPC fresh attempt did not receive accept.");
	}
	if (readIdentifier(record, "profile") !== DEFAULT_RPC_PROFILE_ID) {
		throw new Error("RPC fresh accept selected a different profile.");
	}
	readBase64Url32(record, "sessionId");
	if (record.bindingEpoch !== 1) {
		throw new Error("RPC fresh binding epoch must be one.");
	}
	readBase64Url32(record, "responderNonce");
	readBase64Url32(record, "sessionSecret");
	readBase64Url32(record, "proof");
	return record as DefaultRpcFreshAccept;
}

export function validateDefaultRpcResumeRequest(
	record: DefaultRpcJsonRecord,
): DefaultRpcResumeRequest {
	if (readDefaultRpcRecordKind(record) !== "resume") {
		throw new Error("The first initiator record must be fresh or resume.");
	}
	readIdentifier(record, "profile");
	readBase64Url32(record, "sessionId");
	readAckCursor(record, "receivedThrough");
	readSequence(record, "resumeAttempt");
	readBase64Url32(record, "initiatorNonce");
	readBase64Url32(record, "proof");
	return record as DefaultRpcResumeRequest;
}

export function validateDefaultRpcResumeOutcome(
	record: DefaultRpcJsonRecord,
): DefaultRpcResumeOutcome {
	const kind = readDefaultRpcRecordKind(record);
	if (kind === "accept") {
		readIdentifier(record, "profile");
		readBase64Url32(record, "sessionId");
		readSequence(record, "bindingEpoch");
		readAckCursor(record, "receivedThrough");
		readBase64Url32(record, "responderNonce");
		readBase64Url32(record, "proof");
		return record as DefaultRpcResumeAccept;
	}
	if (kind === "reject") {
		const code = readString(record, "code");
		if (!resumeRejectCodes.has(code as DefaultRpcResumeRejectCode)) {
			throw new Error("RPC resume reject code is outside the profile union.");
		}
		if (own(record, "message")) {
			throw new Error("RPC resume reject must not carry a message.");
		}
		readBase64Url32(record, "responderNonce");
		readBase64Url32(record, "proof");
		return record as DefaultRpcResumeReject;
	}
	throw new Error("RPC resume attempt did not receive accept or reject.");
}

export function validateDefaultRpcActiveRecord(
	record: DefaultRpcJsonRecord,
): DefaultRpcActiveRecord {
	const kind = readDefaultRpcRecordKind(record);
	if (kind === "message") {
		readSequence(record, "seq");
		if (own(record, "ackThrough")) {
			readAckCursor(record, "ackThrough");
		}
		validateSemanticMessage(record.message);
		return record as DefaultRpcMessageEnvelope;
	}
	if (kind === "ack") {
		readAckCursor(record, "ackThrough");
		return record as DefaultRpcAckRecord;
	}
	if (kind === "ping" || kind === "pong" || kind === "close") {
		if (
			kind === "close" &&
			Object.keys(record).some((key) => closeForbiddenMembers.has(key))
		) {
			throw new Error("RPC close contains a forbidden control member.");
		}
		return record as DefaultRpcControlRecord;
	}
	throw new Error("RPC active record kind is unknown.");
}

export function hasDefaultRpcRecordMember(
	record: DefaultRpcJsonRecord,
	key: string,
): boolean {
	return own(record, key);
}

export function asDefaultRpcApplicationValue(
	value: DefaultRpcJsonValue,
): RpcApplicationValue {
	return value as RpcApplicationValue;
}
