/**
 * @overview Starts Node and Vite middleware under one application-owned graceful lifecycle.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { createServer as createHttpServer } from "node:http";
import { createServer, type ViteDevServer } from "vite";
import { createExampleServer } from "@/factories/example-server.factory";
import { waitForShutdown } from "@/utils/wait-for-shutdown.util";

async function main(): Promise<void> {
	const rpc = await createExampleServer();
	const listener = createHttpServer();
	let web: ViteDevServer | undefined;
	try {
		// Middleware mode leaves process signals and the listener lifetime to this application.
		web = await createServer({
			server: {
				middlewareMode: { server: listener },
				ws: { server: listener },
			},
		});
		listener.on("request", web.middlewares);
		await new Promise<void>((resolve, reject) => {
			listener.once("error", reject);
			listener.listen(5_173, "127.0.0.1", () => {
				listener.off("error", reject);
				resolve();
			});
		});
		console.log(`RPC server: ${rpc.origin}/rpc`);
		console.log("Web UI: http://127.0.0.1:5173");
		await waitForShutdown();
	} finally {
		try {
			// Keep the WebSocket proxy alive until admitted RPC calls have drained.
			await rpc.shutdown();
		} finally {
			try {
				await web?.close();
			} finally {
				await new Promise<void>((resolve, reject) => {
					if (!listener.listening) {
						resolve();
						return;
					}
					listener.close((error) => (error ? reject(error) : resolve()));
				});
			}
		}
	}
}

void main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
