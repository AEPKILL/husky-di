/**
 * @overview Identifies an application call within its recording endpoint.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { LabCallRecord } from "@/types/lab-recording.type";

export function getCallRecordKey(call: LabCallRecord): string {
	return `${call.side}:${call.id}`;
}
