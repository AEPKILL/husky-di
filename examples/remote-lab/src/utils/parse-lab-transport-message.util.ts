/**
 * @overview Detaches known JSON wire messages and byte-only metadata for Transport inspection.
 * @author AEPKILL
 * @created 2026-09-11 06:58:25
 */

import {
	LabCallOutcomeEnum,
	LabHandshakeKindEnum,
	type LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";
import type {
	LabHandshakeFrame,
	LabTransportMessage,
} from "@/types/lab-recording.type";

export function parseLabTransportMessage(
	message: Uint8Array,
	connectionId: string,
	direction: LabTransportDirectionEnum,
): LabTransportMessage {
	const metadata: LabTransportMessage = {
		type: "unknown",
		connectionId,
		direction,
		bytes: message.byteLength,
		outcome: LabCallOutcomeEnum.fulfilled,
	};
	// Match the default Protocol's maximum complete wire message without truncation.
	if (message.byteLength > 1_048_576) return metadata;
	try {
		const payload = new TextDecoder("utf-8", {
			fatal: true,
			ignoreBOM: true,
		}).decode(message);
		const record: unknown = JSON.parse(payload);
		if (
			typeof record !== "object" ||
			record === null ||
			Array.isArray(record) ||
			!("kind" in record) ||
			typeof record.kind !== "string" ||
			!MESSAGE_KINDS.has(record.kind)
		)
			return metadata;
		const type = record.kind;
		return {
			...metadata,
			type,
			...((type === LabHandshakeKindEnum.accept ||
				type === LabHandshakeKindEnum.resume) &&
			"sessionId" in record &&
			typeof record.sessionId === "string"
				? { sessionId: record.sessionId }
				: {}),
			outcome:
				type === LabHandshakeKindEnum.reject
					? "failed"
					: LabCallOutcomeEnum.fulfilled,
			payload,
		};
	} catch {
		return metadata;
	}
}

export function isLabHandshakeFrame(
	message: LabTransportMessage,
): message is LabHandshakeFrame {
	return (
		message.payload !== undefined &&
		(message.type === LabHandshakeKindEnum.fresh ||
			message.type === LabHandshakeKindEnum.accept ||
			message.type === LabHandshakeKindEnum.resume ||
			message.type === LabHandshakeKindEnum.reject)
	);
}

// These example-only labels mirror the default Protocol's private wire kinds.
const MESSAGE_KINDS = new Set<string>([
	...Object.values(LabHandshakeKindEnum),
	"call",
	"cancel",
	"result",
	"error",
	"message",
	"ack",
	"ping",
	"pong",
	"close",
]);
