/**
 * @overview Bounded RFC 8259 Codec and record validation for husky-di-rpc/1.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { ZodType } from "zod";
import {
	RPC_MAX_MESSAGE_BYTES,
	RPC_MAX_WIRE_DEPTH,
	RPC_MAX_WIRE_NODES,
} from "@/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import type {
	IRpcCodec,
	RpcDecodedRecord,
} from "@/interfaces/protocol/rpc-codec.interface";
import type {
	RpcJsonRecord,
	RpcJsonValue,
} from "@/types/protocol/rpc-wire-record.type";
import {
	rpcActiveRecordSchema,
	rpcBootstrapRequestSchema,
	rpcFreshAcceptSchema,
	rpcJsonRecordSchema,
	rpcResumeOutcomeSchema,
} from "@/utils/protocol/rpc-wire-grammar.util";

export class RpcCodecImpl implements IRpcCodec {
	public encode(record: RpcJsonRecord): Uint8Array {
		return encodeRpcRecord(record);
	}

	public decode<TPhase extends RpcDecodePhaseEnum>(
		bytes: Uint8Array,
		phase: TPhase,
	): RpcDecodedRecord<TPhase> {
		const record = decodeRpcRecord(bytes);
		switch (phase) {
			case RpcDecodePhaseEnum.bootstrapRequest:
				return validateRpcRecord(
					record,
					rpcBootstrapRequestSchema,
					"The first initiator record must be fresh or resume.",
				) as RpcDecodedRecord<TPhase>;
			case RpcDecodePhaseEnum.freshAccept:
				return validateRpcRecord(
					record,
					rpcFreshAcceptSchema,
					"RPC fresh attempt did not receive accept.",
				) as RpcDecodedRecord<TPhase>;
			case RpcDecodePhaseEnum.resumeOutcome:
				return validateRpcRecord(
					record,
					rpcResumeOutcomeSchema,
					"RPC resume attempt did not receive accept or reject.",
				) as RpcDecodedRecord<TPhase>;
			case RpcDecodePhaseEnum.active:
				return validateRpcRecord(
					record,
					rpcActiveRecordSchema,
					"RPC active record is invalid.",
				) as RpcDecodedRecord<TPhase>;
			default:
				return record as RpcDecodedRecord<TPhase>;
		}
	}
}
type MutableJsonRecord = Record<string, RpcJsonValue>;

const textDecoder = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true,
});
const textEncoder = new TextEncoder();
const numberPattern = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

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

const rpcStableSchemaErrorMessages = new Set([
	"RPC close contains a forbidden control member.",
	"RPC error payload contains an unknown member.",
]);

function validateRpcRecord<TRecord>(
	record: RpcJsonRecord,
	schema: ZodType<TRecord>,
	fallbackMessage: string,
): TRecord {
	const result = schema.safeParse(record);
	if (!result.success) {
		const stableIssue = result.error.issues.find((issue) =>
			rpcStableSchemaErrorMessages.has(issue.message),
		);
		throw new Error(stableIssue?.message ?? fallbackMessage);
	}

	// Zod validates a materialized copy; the bounded parser's original preserves
	// every bounded open-tail member, including __proto__.
	return record as TRecord;
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
