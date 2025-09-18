/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 09:32:03
 */

import type { IResolveRecord } from "@/interfaces/resolve-record.interface";
import { getResolveRecordMessage } from "@/utils/resolve-record.utils";

export class ResolveException extends Error {
	private __isResolveException__ = true;

	constructor(message: string, resolveRecord: IResolveRecord) {
		const cycleNodeInfo = resolveRecord.getCycleNodeInfo();
		const cycleNode = cycleNodeInfo?.cycleNode.value;
		const paths = resolveRecord
			.getPaths()
			.map((it) => it.value)
			.reverse();

		super(
			getResolveRecordMessage({
				message,
				paths,
				cycleNode,
			}),
		);
	}

	static isResolveException(error: unknown): error is ResolveException {
		// don't use instanceof, because it will be false when the error is not in the same frame
		return (
			(error as unknown as ResolveException)?.__isResolveException__ === true
		);
	}
}
