/**
 * @overview Detaches safe public lifecycle fields without copying raw Error objects.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { RpcException } from "@husky-di/remote";
import type { LabObservedState } from "@/types/lab-owner.type";

export function projectLabState(state: {
	readonly status: string;
}): LabObservedState {
	return {
		status: state.status,
		...("outcome" in state && typeof state.outcome === "string"
			? { outcome: state.outcome }
			: {}),
		...("reason" in state && typeof state.reason === "string"
			? { reason: state.reason }
			: {}),
		...("error" in state
			? {
					error:
						state.error instanceof RpcException
							? state.error.code
							: state.error instanceof TypeError
								? "TypeError"
								: "Error",
				}
			: {}),
		...("attempt" in state && typeof state.attempt === "number"
			? { attempt: state.attempt }
			: {}),
		...("nextAttempt" in state && typeof state.nextAttempt === "number"
			? { nextAttempt: state.nextAttempt }
			: {}),
		...("delayMs" in state && typeof state.delayMs === "number"
			? { delayMs: state.delayMs }
			: {}),
	};
}
