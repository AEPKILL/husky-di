/**
 * @overview Loads project node modules in a process belonging to one killable execution.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { createLabNodeContext } from "@/factories/platform/lab-node-context.factory";
import { loadLabModule } from "@/utils/platform/load-lab-module.util";

let module: Record<string, unknown> | undefined;
let lifetime: ReturnType<typeof createLabNodeContext> | undefined;

process.on(
	"message",
	async (message: {
		type: string;
		requestId: number;
		entry: string;
		snapshotDir: string;
		parameters: Record<string, unknown>;
		nodeId: string;
		exportName: string;
		args: unknown[];
	}) => {
		try {
			let result: unknown;
			if (message.type === "start") {
				process.chdir(message.snapshotDir);
				lifetime = createLabNodeContext({
					parameters: message.parameters,
					nodeId: message.nodeId,
					emit: (data) => process.send?.({ type: "record", data }),
				});
				module = await loadLabModule(message.snapshotDir, message.entry);
				if (typeof module?.labNode !== "function")
					throw new TypeError(
						"Node module must export a labNode(context) function.",
					);
				result = await module.labNode(lifetime.context);
			} else if (message.type === "call") {
				const operation = module?.[message.exportName];
				if (typeof operation !== "function")
					throw new TypeError(`No callable export: ${message.exportName}`);
				result = await operation(...message.args);
			} else if (message.type === "close") {
				await lifetime?.close();
			}
			process.send?.(
				{ type: "response", requestId: message.requestId, result },
				() => {
					if (message.type === "close") process.exit(0);
				},
			);
		} catch (error) {
			process.send?.(
				{
					type: "response",
					requestId: message.requestId,
					error: error instanceof Error ? error.stack : String(error),
				},
				() => {
					if (message.type === "close") process.exit(1);
				},
			);
		}
	},
);

process.on("disconnect", () => {
	void lifetime?.close().finally(() => process.exit(1));
});
