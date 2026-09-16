/**
 * @overview Detaches complete JSON handshake frames for example-owned Transport inspection.
 * @author AEPKILL
 * @created 2026-09-10 21:55:04
 */

import type { LabTransportDirectionEnum } from "@/enums/lab-recording.enum";
import type { LabHandshakeFrame } from "@/types/lab-recording.type";
import {
	isLabHandshakeFrame,
	parseLabTransportMessage,
} from "@/utils/parse-lab-transport-message.util";

export function parseLabHandshakeFrame(
	message: Uint8Array,
	connectionId: string,
	direction: LabTransportDirectionEnum,
): LabHandshakeFrame | undefined {
	const frame = parseLabTransportMessage(message, connectionId, direction);
	return isLabHandshakeFrame(frame) ? frame : undefined;
}
