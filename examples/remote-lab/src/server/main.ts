/**
 * @overview Runs the standalone Node RPC example and gracefully drains on termination.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { createExampleServer } from "@/factories/example-server.factory";
import { waitForShutdown } from "@/utils/wait-for-shutdown.util";

async function main(): Promise<void> {
	const server = await createExampleServer();
	try {
		console.log(`RPC server: ${server.origin}/rpc`);
		await waitForShutdown();
	} finally {
		await server.shutdown();
	}
}

void main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
