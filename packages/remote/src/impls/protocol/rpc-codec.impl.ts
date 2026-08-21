/**
 * @overview Bounded RFC 8259 Codec and record validation for husky-di-rpc/1.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RPC_MAX_MESSAGE_BYTES } from "@/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcProfileEnum } from "@/enums/protocol/rpc-profile.enum";
import { RpcResumeRejectCodeEnum } from "@/enums/protocol/rpc-resume-reject-code.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type { RpcDecodedRecord } from "@/types/protocol/rpc-codec.type";
import type {
	RpcAckRecord,
	RpcActiveRecord,
	RpcCallMessage,
	RpcCancelMessage,
	RpcControlRecord,
	RpcErrorMessage,
	RpcFreshAccept,
	RpcFreshRequest,
	RpcJsonRecord,
	RpcJsonValue,
	RpcMessageEnvelope,
	RpcResultMessage,
	RpcResumeAccept,
	RpcResumeOutcome,
	RpcResumeReject,
	RpcResumeRequest,
	RpcSemanticMessage,
	RpcWireErrorCode,
} from "@/types/protocol/rpc-wire-record.type";

export class RpcCodecImpl implements IRpcCodec {
	public encode(record: RpcJsonRecord): Uint8Array {
		return encodeRpcRecord(record);
	}

	public decode<TPhase extends RpcDecodePhaseEnum>(
		bytes: Uint8Array,
		phase: TPhase,
	): RpcDecodedRecord<TPhase> {
		const record = decodeRpcRecord(bytes);
		let decoded:
			| RpcJsonRecord
			| RpcFreshRequest
			| RpcFreshAccept
			| RpcResumeRequest
			| RpcResumeOutcome
			| RpcActiveRecord;
		switch (phase) {
			case RpcDecodePhaseEnum.bootstrapRequest: {
				const kind = readRpcRecordKind(record);
				if (kind === RpcWireRecordKindEnum.fresh) {
					decoded = validateRpcFreshRequest(record);
					break;
				}
				if (kind === RpcWireRecordKindEnum.resume) {
					decoded = validateRpcResumeRequest(record);
					break;
				}
				throw new Error("The first initiator record must be fresh or resume.");
			}
			case RpcDecodePhaseEnum.freshAccept:
				decoded = validateRpcFreshAccept(record);
				break;
			case RpcDecodePhaseEnum.resumeOutcome:
				decoded = validateRpcResumeOutcome(record);
				break;
			case RpcDecodePhaseEnum.active:
				decoded = validateRpcActiveRecord(record);
				break;
			default:
				decoded = record;
		}
		return decoded as RpcDecodedRecord<TPhase>;
	}
}

const textDecoder = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true,
});
const textEncoder = new TextEncoder();
const base64Url32Pattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const callOrdinalPattern = /^(?:[1-9][0-9]{0,15})$/;
const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const wireErrorCodes = new Set<RpcWireErrorCode>([
	RpcExceptionCodeEnum.canceled,
	RpcExceptionCodeEnum.unavailable,
	RpcExceptionCodeEnum.handlerFailed,
	RpcExceptionCodeEnum.unknownService,
	RpcExceptionCodeEnum.unknownMethod,
]);
const resumeRejectCodes = new Set<RpcResumeRejectCodeEnum>([
	RpcResumeRejectCodeEnum.resumeRejected,
	RpcResumeRejectCodeEnum.continuityFailure,
	RpcResumeRejectCodeEnum.sessionTerminated,
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

type MutableJsonRecord = Record<string, RpcJsonValue>;

class BoundedJsonParser {
	readonly _text: string;
	_index = 0;
	_nodes = 0;

	constructor(text: string) {
		this._text = text;
	}

	parse(): RpcJsonRecord {
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

	_parseValue(depth: number): RpcJsonValue {
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

	_parseObject(depth: number): RpcJsonRecord {
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

	_parseArray(depth: number): readonly RpcJsonValue[] {
		this._index += 1;
		this._skipWhitespace();
		const result: RpcJsonValue[] = [];
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

function isJsonRecord(value: RpcJsonValue): value is RpcJsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(record: RpcJsonRecord, key: string): boolean {
	return Object.getOwnPropertyDescriptor(record, key) !== undefined;
}

function readString(record: RpcJsonRecord, key: string): string {
	const value = record[key];
	if (typeof value !== "string") {
		throw new Error(`RPC record ${key} must be a string.`);
	}
	return value;
}

function readIdentifier(record: RpcJsonRecord, key: string): string {
	const value = readString(record, key);
	if (value.length === 0 || textEncoder.encode(value).byteLength > 256) {
		throw new Error(`RPC record ${key} is not a valid identifier.`);
	}
	return value;
}

function readBase64Url32(record: RpcJsonRecord, key: string): string {
	const value = readString(record, key);
	if (!base64Url32Pattern.test(value)) {
		throw new Error(`RPC record ${key} is not canonical Base64Url32.`);
	}
	return value;
}

function readSequence(record: RpcJsonRecord, key: string): number {
	const value = record[key];
	if (!Number.isSafeInteger(value) || (value as number) < 1) {
		throw new Error(`RPC record ${key} must be a positive safe integer.`);
	}
	return value as number;
}

function readAckCursor(record: RpcJsonRecord, key: string): number {
	const value = record[key];
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new Error(`RPC record ${key} must be a non-negative safe integer.`);
	}
	return value as number;
}

function readCallId(record: RpcJsonRecord): string {
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
	value: RpcJsonValue | undefined,
): RpcSemanticMessage {
	if (value === undefined || !isJsonRecord(value)) {
		throw new Error("RPC semantic message must be an object.");
	}
	const kind = readString(value, "kind");
	readCallId(value);
	if (kind === RpcWireRecordKindEnum.call) {
		readIdentifier(value, "service");
		const method = readIdentifier(value, "method");
		if (method === "then") {
			throw new Error("RPC wire method then is reserved.");
		}
		if (!Array.isArray(value.args)) {
			throw new Error("RPC call args must be an array.");
		}
		return value as RpcCallMessage;
	}
	if (kind === RpcWireRecordKindEnum.cancel) {
		return value as RpcCancelMessage;
	}
	if (kind === RpcWireRecordKindEnum.result) {
		return value as RpcResultMessage;
	}
	if (kind === RpcWireRecordKindEnum.error) {
		if (!isJsonRecord(value.error)) {
			throw new Error("RPC error payload must be an object.");
		}
		for (const key of Object.keys(value.error)) {
			if (key !== "code" && key !== "message" && key !== "details") {
				throw new Error("RPC error payload contains an unknown member.");
			}
		}
		const code = readString(value.error, "code");
		if (!wireErrorCodes.has(code as RpcWireErrorCode)) {
			throw new Error("RPC error code is outside the profile union.");
		}
		readString(value.error, "message");
		return value as RpcErrorMessage;
	}
	throw new Error("RPC semantic message kind is unknown.");
}

function encodeRpcRecord(record: RpcJsonRecord): Uint8Array {
	const encoded = textEncoder.encode(JSON.stringify(record));
	if (encoded.byteLength > RPC_MAX_MESSAGE_BYTES) {
		throw new Error("RPC record exceeds the Transport message limit.");
	}
	return encoded;
}

function decodeRpcRecord(bytes: Uint8Array): RpcJsonRecord {
	if (bytes.byteLength > RPC_MAX_MESSAGE_BYTES) {
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

function readRpcRecordKind(record: RpcJsonRecord): string {
	return readString(record, "kind");
}

function validateRpcFreshRequest(record: RpcJsonRecord): RpcFreshRequest {
	if (readRpcRecordKind(record) !== RpcWireRecordKindEnum.fresh) {
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
	return record as RpcFreshRequest;
}

function validateRpcFreshAccept(record: RpcJsonRecord): RpcFreshAccept {
	if (readRpcRecordKind(record) !== RpcWireRecordKindEnum.accept) {
		throw new Error("RPC fresh attempt did not receive accept.");
	}
	if (readIdentifier(record, "profile") !== RpcProfileEnum.huskyDiRpc1) {
		throw new Error("RPC fresh accept selected a different profile.");
	}
	readBase64Url32(record, "sessionId");
	if (record.bindingEpoch !== 1) {
		throw new Error("RPC fresh binding epoch must be one.");
	}
	readBase64Url32(record, "responderNonce");
	readBase64Url32(record, "sessionSecret");
	readBase64Url32(record, "proof");
	return record as RpcFreshAccept;
}

function validateRpcResumeRequest(record: RpcJsonRecord): RpcResumeRequest {
	if (readRpcRecordKind(record) !== RpcWireRecordKindEnum.resume) {
		throw new Error("The first initiator record must be fresh or resume.");
	}
	readIdentifier(record, "profile");
	readBase64Url32(record, "sessionId");
	readAckCursor(record, "receivedThrough");
	readSequence(record, "resumeAttempt");
	readBase64Url32(record, "initiatorNonce");
	readBase64Url32(record, "proof");
	return record as RpcResumeRequest;
}

function validateRpcResumeOutcome(record: RpcJsonRecord): RpcResumeOutcome {
	const kind = readRpcRecordKind(record);
	if (kind === RpcWireRecordKindEnum.accept) {
		readIdentifier(record, "profile");
		readBase64Url32(record, "sessionId");
		readSequence(record, "bindingEpoch");
		readAckCursor(record, "receivedThrough");
		readBase64Url32(record, "responderNonce");
		readBase64Url32(record, "proof");
		return record as RpcResumeAccept;
	}
	if (kind === RpcWireRecordKindEnum.reject) {
		const code = readString(record, "code");
		if (!resumeRejectCodes.has(code as RpcResumeRejectCodeEnum)) {
			throw new Error("RPC resume reject code is outside the profile union.");
		}
		if (own(record, "message")) {
			throw new Error("RPC resume reject must not carry a message.");
		}
		readBase64Url32(record, "responderNonce");
		readBase64Url32(record, "proof");
		return record as RpcResumeReject;
	}
	throw new Error("RPC resume attempt did not receive accept or reject.");
}

function validateRpcActiveRecord(record: RpcJsonRecord): RpcActiveRecord {
	const kind = readRpcRecordKind(record);
	switch (kind) {
		case RpcWireRecordKindEnum.message:
			readSequence(record, "seq");
			if (own(record, "ackThrough")) {
				readAckCursor(record, "ackThrough");
			}
			validateSemanticMessage(record.message);
			return record as RpcMessageEnvelope;
		case RpcWireRecordKindEnum.ack:
			readAckCursor(record, "ackThrough");
			return record as RpcAckRecord;
		case RpcWireRecordKindEnum.ping:
		case RpcWireRecordKindEnum.pong:
		case RpcWireRecordKindEnum.close:
			if (
				kind === RpcWireRecordKindEnum.close &&
				Object.keys(record).some((key) => closeForbiddenMembers.has(key))
			) {
				throw new Error("RPC close contains a forbidden control member.");
			}
			return record as RpcControlRecord;
		default:
			throw new Error("RPC active record kind is unknown.");
	}
}
