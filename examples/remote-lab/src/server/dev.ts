/**
 * @overview Starts Node and Vite under one graceful lifetime with configurable owned loopback ports.
 * @author AEPKILL
 * @created 2026-09-09 23:59:09
 */

import { createLabEnvironment } from "@/factories/lab-environment.factory";
import { waitForShutdown } from "@/utils/wait-for-shutdown.util";

async function main(): Promise<void> {
	const environment = await createLabEnvironment({
		rpcPort: readPort("LAB_RPC_PORT", 3_000),
		webPort: readPort("LAB_WEB_PORT", 5_173),
	});
	try {
		console.log(`Web UI: ${environment.origin}`);
		await waitForShutdown();
	} finally {
		await environment.shutdown();
	}
}

function readPort(name: string, fallback: number): number {
	const port =
		process.env[name] === undefined ? fallback : Number(process.env[name]);
	if (!Number.isSafeInteger(port) || port < 0 || port > 65_535)
		throw new RangeError(`${name} must be an integer port from 0 to 65535.`);
	return port;
}

void main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
