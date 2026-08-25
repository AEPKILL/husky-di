/**
 * @overview Bounded RFC 8259 Codec and record validation for husky-di-rpc/1.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	RPC_MAX_MESSAGE_BYTES,
	RPC_MAX_WIRE_DEPTH,
	RPC_MAX_WIRE_NODES,
	RPC_PROFILE,
} from "@/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
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
} from "@/types/protocol/rpc-wire-record.type";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
} from "@/utils/rpc-application-value.util";
import {
	rpcBase64Url32Schema,
	rpcCallOrdinalSchema,
	rpcErrorPayloadMemberNamesSchema,
	rpcFirstBindingEpochSchema,
	rpcJsonArraySchema,
	rpcJsonRecordSchema,
	rpcNonEmptyJsonArraySchema,
	rpcNonNegativeSafeIntegerSchema,
	rpcPositiveSafeIntegerSchema,
	rpcProfileOfferSchema,
	rpcResumeRejectCodeSchema,
	rpcStringSchema,
	rpcWireErrorCodeSchema,
	rpcWireIdentifierSchema,
} from "@/utils/rpc-schema.util";

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
				switch (kind) {
					case RpcWireRecordKindEnum.fresh:
						decoded = validateRpcFreshRequest(record);
						break;
					case RpcWireRecordKindEnum.resume:
						decoded = validateRpcResumeRequest(record);
						break;
					default:
						throw new Error(
							"The first initiator record must be fresh or resume.",
						);
				}
				break;
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
const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
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
		if (depth > RPC_MAX_WIRE_DEPTH) {
			throw new Error("RPC JSON exceeds the depth limit.");
		}
		this._nodes += 1;
		if (this._nodes > RPC_MAX_WIRE_NODES) {
			throw new Error("RPC JSON exceeds the node limit.");
		}

		const character = this._text[this._index];
		switch (character) {
			case "{":
				return this._parseObject(depth);
			case "[":
				return this._parseArray(depth);
			case '"':
				return this._parseString(524_288, "string");
			case "t":
				this._consumeLiteral("true");
				return true;
			case "f":
				this._consumeLiteral("false");
				return false;
			case "n":
				this._consumeLiteral("null");
				return null;
			default:
				return this._parseNumber();
		}
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
			switch (separator) {
				case "}":
					return result;
				case ",":
					break;
				default:
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
			switch (separator) {
				case "]":
					return result;
				case ",":
					break;
				default:
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
				// JSON escapes require one of the grammar's defined escape characters.
				const escapeIsInvalid =
					escapeCharacter === undefined ||
					!'"\\/bfnrt'.includes(escapeCharacter);
				if (escapeIsInvalid) {
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
	if (!value.isWellFormed()) {
		throw new Error(`RPC JSON ${label} contains an unpaired surrogate.`);
	}
}

function isJsonRecord(value: RpcJsonValue): value is RpcJsonRecord {
	return rpcJsonRecordSchema.safeParse(value).success;
}

function readString(record: RpcJsonRecord, key: string): string {
	const value = record[key];
	const result = rpcStringSchema.safeParse(value);
	if (!result.success) {
		throw new Error(`RPC record ${key} must be a string.`);
	}
	return result.data;
}

function readIdentifier(record: RpcJsonRecord, key: string): string {
	const value = readString(record, key);
	const result = rpcWireIdentifierSchema.safeParse(value);
	if (!result.success) {
		throw new Error(`RPC record ${key} is not a valid identifier.`);
	}
	return result.data;
}

function readBase64Url32(record: RpcJsonRecord, key: string): string {
	const value = readString(record, key);
	const result = rpcBase64Url32Schema.safeParse(value);
	if (!result.success) {
		throw new Error(`RPC record ${key} is not canonical Base64Url32.`);
	}
	return result.data;
}

function readSequence(record: RpcJsonRecord, key: string): number {
	const result = rpcPositiveSafeIntegerSchema.safeParse(record[key]);
	if (!result.success) {
		throw new Error(`RPC record ${key} must be a positive safe integer.`);
	}
	return result.data;
}

function readAckCursor(record: RpcJsonRecord, key: string): number {
	const result = rpcNonNegativeSafeIntegerSchema.safeParse(record[key]);
	if (!result.success) {
		throw new Error(`RPC record ${key} must be a non-negative safe integer.`);
	}
	return result.data;
}

function readCallId(record: RpcJsonRecord): string {
	const value = readString(record, "callId");
	if (!rpcCallOrdinalSchema.safeParse(value).success) {
		throw new Error("RPC callId must be a canonical Call Ordinal.");
	}
	const ordinal = Number(value);
	if (!rpcPositiveSafeIntegerSchema.safeParse(ordinal).success) {
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
	switch (kind) {
		case RpcWireRecordKindEnum.call: {
			readIdentifier(value, "service");
			const method = readIdentifier(value, "method");
			if (method === "then") {
				throw new Error("RPC wire method then is reserved.");
			}
			if (!rpcJsonArraySchema.safeParse(value.args).success) {
				throw new Error("RPC call args must be an array.");
			}
			normalizeRpcApplicationArguments(value.args);
			return value as RpcCallMessage;
		}
		case RpcWireRecordKindEnum.cancel:
			return value as RpcCancelMessage;
		case RpcWireRecordKindEnum.result:
			if (Object.hasOwn(value, "value")) {
				normalizeRpcApplicationValue(value.value);
			}
			return value as RpcResultMessage;
		case RpcWireRecordKindEnum.error: {
			if (!isJsonRecord(value.error)) {
				throw new Error("RPC error payload must be an object.");
			}
			if (
				!rpcErrorPayloadMemberNamesSchema.safeParse(
					Reflect.ownKeys(value.error),
				).success
			) {
				throw new Error("RPC error payload contains an unknown member.");
			}
			const code = readString(value.error, "code");
			if (!rpcWireErrorCodeSchema.safeParse(code).success) {
				throw new Error("RPC error code is outside the profile union.");
			}
			readString(value.error, "message");
			if (Object.hasOwn(value.error, "details")) {
				normalizeRpcApplicationValue(value.error.details);
			}
			return value as RpcErrorMessage;
		}
		default:
			throw new Error("RPC semantic message kind is unknown.");
	}
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
	const profiles = rpcProfileOfferSchema.safeParse(record.profiles);
	if (!profiles.success) {
		if (!rpcNonEmptyJsonArraySchema.safeParse(record.profiles).success) {
			throw new Error("RPC fresh profiles must be a non-empty array.");
		}
		throw new Error("RPC fresh profile offer is invalid.");
	}
	readBase64Url32(record, "initiatorNonce");
	return record as RpcFreshRequest;
}

function validateRpcFreshAccept(record: RpcJsonRecord): RpcFreshAccept {
	if (readRpcRecordKind(record) !== RpcWireRecordKindEnum.accept) {
		throw new Error("RPC fresh attempt did not receive accept.");
	}
	if (readIdentifier(record, "profile") !== RPC_PROFILE) {
		throw new Error("RPC fresh accept selected a different profile.");
	}
	readBase64Url32(record, "sessionId");
	if (!rpcFirstBindingEpochSchema.safeParse(record.bindingEpoch).success) {
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
	switch (kind) {
		case RpcWireRecordKindEnum.accept:
			readIdentifier(record, "profile");
			readBase64Url32(record, "sessionId");
			readSequence(record, "bindingEpoch");
			readAckCursor(record, "receivedThrough");
			readBase64Url32(record, "responderNonce");
			readBase64Url32(record, "proof");
			return record as RpcResumeAccept;
		case RpcWireRecordKindEnum.reject: {
			const code = readString(record, "code");
			if (!rpcResumeRejectCodeSchema.safeParse(code).success) {
				throw new Error("RPC resume reject code is outside the profile union.");
			}
			if (Object.hasOwn(record, "message")) {
				throw new Error("RPC resume reject must not carry a message.");
			}
			readBase64Url32(record, "responderNonce");
			readBase64Url32(record, "proof");
			return record as RpcResumeReject;
		}
		default:
			throw new Error("RPC resume attempt did not receive accept or reject.");
	}
}

function validateRpcActiveRecord(record: RpcJsonRecord): RpcActiveRecord {
	const kind = readRpcRecordKind(record);
	switch (kind) {
		case RpcWireRecordKindEnum.message:
			readSequence(record, "seq");
			if (Object.hasOwn(record, "ackThrough")) {
				readAckCursor(record, "ackThrough");
			}
			validateSemanticMessage(record.message);
			return record as RpcMessageEnvelope;
		case RpcWireRecordKindEnum.ack:
			readAckCursor(record, "ackThrough");
			return record as RpcAckRecord;
		case RpcWireRecordKindEnum.ping:
		case RpcWireRecordKindEnum.pong:
			return record as RpcControlRecord;
		case RpcWireRecordKindEnum.close:
			if (Object.keys(record).some((key) => closeForbiddenMembers.has(key))) {
				throw new Error("RPC close contains a forbidden control member.");
			}
			return record as RpcControlRecord;
		default:
			throw new Error("RPC active record kind is unknown.");
	}
}
