/**
 * @overview Serves immutable browser project modules at their original relative paths with shared dependencies.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";

export type CreateLabBrowserModulesOptions = {
	readonly snapshotDir: string;
	readonly entry: string;
	readonly parameters: Readonly<Record<string, unknown>>;
	readonly nodeId: string;
	readonly onError: (error: unknown) => void;
};

export async function createLabBrowserModules({
	snapshotDir,
	entry,
	parameters,
	nodeId,
	onError,
}: CreateLabBrowserModulesOptions) {
	const root = realpathSync(snapshotDir);
	const sourcePath = (file: string) =>
		`/source/${file.split(sep).map(encodeURIComponent).join("/")}`;
	const within = (file: string) => {
		const path = relative(root, file);
		return path !== ".." && !path.startsWith(`..${sep}`);
	};
	const cache = new Map<string, Promise<string>>();
	const dependencies = new Map<string, string>();
	const dependencyIds = new Map<string, string>();
	const plugin: Plugin = {
		name: "saved-browser-project",
		setup(builder) {
			builder.onResolve({ filter: /.*/ }, async (args) => {
				if (args.kind === "entry-point" || args.pluginData?.resolving) return;
				const resolved = await builder.resolve(args.path, {
					kind: args.kind,
					resolveDir: args.resolveDir,
					pluginData: { resolving: true },
				});
				if (resolved.errors.length) return { errors: resolved.errors };
				if (within(resolved.path))
					return {
						path: sourcePath(relative(root, resolved.path)),
						external: true,
					};
				if (!args.path.startsWith(".") && !args.path.startsWith("/")) {
					let id = dependencyIds.get(resolved.path);
					if (!id) {
						id = String(dependencyIds.size + 1);
						dependencyIds.set(resolved.path, id);
						dependencies.set(id, resolved.path);
					}
					return { path: `/dependency/${id}`, external: true };
				}
				return;
			});
		},
	};
	const compile = (path: string, entryPoint: string) => {
		let result = cache.get(path);
		if (!result) {
			result = build({
				entryPoints: [entryPoint],
				absWorkingDir: root,
				bundle: true,
				platform: "browser",
				format: "esm",
				write: false,
				sourcemap: "inline",
				plugins: [plugin],
				nodePaths: [
					fileURLToPath(new URL("../../../node_modules", import.meta.url)),
				],
			}).then((result) => result.outputFiles[0]?.text ?? "");
			cache.set(path, result);
		}
		return result;
	};
	const listener = createServer((request, response) => {
		void (async () => {
			const path = new URL(request.url ?? "/", "http://localhost").pathname;
			response.setHeader("Cache-Control", "no-store");
			if (path === "/") {
				response.setHeader("Content-Type", "text/html");
				response.end("<!doctype html><title>Lab owned Chromium node</title>");
				return;
			}
			response.setHeader("Content-Type", "text/javascript; charset=utf-8");
			if (path === "/bootstrap.js") {
				response.end(
					`import * as userModule from ${JSON.stringify(sourcePath(relative(root, realpathSync(entry))))}; import {createLabNodeContext} from '/context.js'; globalThis.__lab = {module:userModule,...createLabNodeContext({nodeId:${JSON.stringify(nodeId)},parameters:${JSON.stringify(parameters)},emit:data=>void globalThis.__labEmit(data)})};`,
				);
				return;
			}
			if (path === "/context.js") {
				response.end(
					await compile(
						path,
						fileURLToPath(
							new URL("./lab-node-context.factory.ts", import.meta.url),
						),
					),
				);
				return;
			}
			if (path.startsWith("/source/")) {
				const source = realpathSync(
					resolve(root, decodeURIComponent(path.slice("/source/".length))),
				);
				if (!within(source))
					throw new Error("Browser import escapes the saved project snapshot.");
				response.end(await compile(path, source));
				return;
			}
			if (path.startsWith("/dependency/")) {
				const dependency = dependencies.get(path.slice("/dependency/".length));
				if (!dependency) throw new Error("Unknown browser dependency.");
				response.end(await compile(path, dependency));
				return;
			}
			response.statusCode = 404;
			response.end("throw new Error('Unknown Lab module.');");
		})().catch((error) => {
			onError(error);
			response.statusCode = 500;
			response.end(
				`throw new Error(${JSON.stringify(error instanceof Error ? error.message : String(error))});`,
			);
		});
	});
	await new Promise<void>((resolveListen, reject) => {
		listener.once("error", reject);
		listener.listen(0, "127.0.0.1", () => {
			listener.off("error", reject);
			resolveListen();
		});
	});
	const address = listener.address();
	if (!address || typeof address === "string")
		throw new Error("Missing browser module listener address.");
	return {
		origin: `http://127.0.0.1:${address.port}`,
		close: () =>
			new Promise<void>((resolveClose, reject) => {
				listener.closeAllConnections();
				listener.close((error) => (error ? reject(error) : resolveClose()));
			}),
	};
}
