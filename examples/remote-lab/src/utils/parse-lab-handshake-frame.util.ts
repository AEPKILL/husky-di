/**
 * @overview Detaches complete JSON handshake frames for example-owned Transport inspection.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import {
	LabCallOutcomeEnum,
	LabHandshakeKindEnum,
	type LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";
import type { LabHandshakeFrame } from "@/types/lab-recording.type";

export function parseLabHandshakeFrame(
	message: Uint8Array,
	connectionId: string,
	direction: LabTransportDirectionEnum,
): LabHandshakeFrame | undefined {
	// Match the default Protocol's maximum complete wire message without truncation.
	if (message.byteLength > 1_048_576) return;
	try {
		const payload = new TextDecoder("utf-8", {
			fatal: true,
			ignoreBOM: true,
		}).decode(message);
		const record: unknown = JSON.parse(payload);
		if (typeof record !== "object" || record === null || Array.isArray(record))
			return;
		if (!("kind" in record)) return;
		const type = record.kind;
		if (
			type !== LabHandshakeKindEnum.fresh &&
			type !== LabHandshakeKindEnum.accept &&
			type !== LabHandshakeKindEnum.resume &&
			type !== LabHandshakeKindEnum.reject
		)
			return;
		return {
			type,
			connectionId,
			...((type === LabHandshakeKindEnum.accept ||
				type === LabHandshakeKindEnum.resume) &&
			"sessionId" in record &&
			typeof record.sessionId === "string"
				? { sessionId: record.sessionId }
				: {}),
			direction,
			bytes: message.byteLength,
			outcome:
				type === LabHandshakeKindEnum.reject
					? "failed"
					: LabCallOutcomeEnum.fulfilled,
			payload,
		};
	} catch {
		return;
	}
}
