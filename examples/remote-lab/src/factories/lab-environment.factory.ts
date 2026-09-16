/**
 * @overview Owns one isolated Node and Vite listener pair with dynamically assigned ports.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { createExampleServer } from "@/factories/example-server.factory";
import { createPlatformService } from "@/factories/platform-service.factory";
import type { IExampleServer } from "@/interfaces/example-server.interface";
import type { ILabE2eRunner } from "@/interfaces/lab-e2e-runner.interface";
import type { IPlatformService } from "@/interfaces/platform-service.interface";

export type CreateLabEnvironmentOptions = {
	readonly rpcPort?: number;
	readonly webPort?: number;
	readonly e2eRunner?: ILabE2eRunner;
	readonly watch?: boolean;
	readonly platform?: IPlatformService;
};

export async function createLabEnvironment(
	options: CreateLabEnvironmentOptions = {},
): Promise<IExampleServer> {
	const platform = options.platform ?? createPlatformService();
	const rpc = await createExampleServer({
		port: options.rpcPort ?? 0,
		...(options.e2eRunner ? { e2eRunner: options.e2eRunner } : {}),
	});
	const listener = createServer();
	let web: ViteDevServer | undefined;
	let shutdownTask: Promise<void> | undefined;
	const shutdown = () => {
		shutdownTask ??= (async () => {
			try {
				try {
					await platform.shutdown();
				} finally {
					await rpc.shutdown();
				}
			} finally {
				try {
					await web?.close();
				} finally {
					listener.closeAllConnections();
					await new Promise<void>((resolve, reject) => {
						if (!listener.listening) return resolve();
						listener.close((error) => (error ? reject(error) : resolve()));
					});
				}
			}
		})();
		return shutdownTask;
	};
	try {
		const root = fileURLToPath(new URL("../../", import.meta.url));
		web = await createViteServer({
			root,
			configFile: `${root}/vite.config.ts`,
			logLevel: "error",
			server: {
				// Vite's config merge discards null; explicitly ignore watched paths and disable HMR.
				...(options.watch === false
					? { watch: { ignored: () => true }, hmr: false }
					: {}),
				middlewareMode: { server: listener },
				ws: { server: listener },
				proxy: {
					"/rpc": { target: rpc.origin.replace("http:", "ws:"), ws: true },
					"/api": rpc.origin,
					"/health": rpc.origin,
				},
			},
		});
		listener.on("request", (request, response) => {
			if (!platform.handleRequest(request, response))
				web?.middlewares(request, response);
		});
		await new Promise<void>((resolve, reject) => {
			listener.once("error", reject);
			listener.listen(options.webPort ?? 0, "127.0.0.1", () => {
				listener.off("error", reject);
				resolve();
			});
		});
		const address = listener.address();
		if (!address || typeof address === "string")
			throw new Error("Missing web listener address.");
		return { origin: `http://127.0.0.1:${address.port}`, shutdown };
	} catch (error) {
		await shutdown();
		throw error;
	}
}
