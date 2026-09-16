/**
 * @overview Identifies an application call within its recording endpoint.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import type { LabCallRecord } from "@/types/lab-recording.type";

export function getCallRecordKey(call: LabCallRecord): string {
	return `${call.side}:${call.id}`;
}
