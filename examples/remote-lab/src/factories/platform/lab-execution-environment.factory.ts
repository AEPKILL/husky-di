/**
 * @overview Assembles real Node processes and Chromium pages from immutable project source.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { fork } from "node:child_process";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, chromium } from "@playwright/test";
import { LabNodeKindEnum } from "@/enums/platform/execution.enum";
import { createLabBrowserModules } from "@/factories/platform/lab-browser-modules.factory";
import type {
	ILabEnvironment,
	ILabNode,
} from "@/interfaces/platform/lab-case.interface";

export type CreateLabExecutionEnvironmentOptions = {
	readonly snapshotDir: string;
	readonly browserWSEndpoint?: string;
	readonly emit: (data: unknown) => void;
	readonly own: (cleanup: () => Promise<void>) => () => void;
};

export function createLabExecutionEnvironment({
	snapshotDir,
	browserWSEndpoint,
	emit,
	own,
}: CreateLabExecutionEnvironmentOptions): ILabEnvironment {
	let nextId = 0;
	const entryPath = (entry: string) => {
		const absolute = resolve(snapshotDir, entry);
		const path = relative(snapshotDir, absolute);
		if (path === ".." || path.startsWith(`..${sep}`))
			throw new Error("Node entry must belong to the saved project snapshot.");
		return absolute;
	};
	return {
		async node(entry, parameters = {}) {
			const absolute = entryPath(entry);
			const id = `node-${++nextId}`;
			const child = fork(
				fileURLToPath(new URL("../../runtime/node.ts", import.meta.url)),
				[],
				{
					cwd: fileURLToPath(new URL("../../../", import.meta.url)),
					execArgv: ["--import", "tsx"],
					stdio: ["ignore", "pipe", "pipe", "ipc"],
					serialization: "advanced",
				},
			);
			let requestId = 0;
			let closing: Promise<void> | undefined;
			const pending = new Map<
				number,
				{ resolve(value: unknown): void; reject(error: Error): void }
			>();
			const exited = new Promise<number | null>((resolveExit) => {
				child.once("exit", (code) => {
					for (const request of pending.values())
						request.reject(new Error(`Lab node exited (${code}).`));
					pending.clear();
					resolveExit(code);
				});
			});
			child.on("error", (error) => {
				for (const request of pending.values()) request.reject(error);
			});
			child.stdout?.on("data", (data) =>
				emit({ nodeId: id, kind: "stdout", message: String(data) }),
			);
			child.stderr?.on("data", (data) =>
				emit({ nodeId: id, kind: "stderr", message: String(data) }),
			);
			child.on(
				"message",
				(message: {
					type: string;
					data: unknown;
					requestId: number;
					result: unknown;
					error?: string;
				}) => {
					if (message.type === "record") {
						emit({
							nodeId: id,
							kind: LabNodeKindEnum.node,
							data: message.data,
						});
						return;
					}
					const request = pending.get(message.requestId);
					pending.delete(message.requestId);
					if (message.error) request?.reject(new Error(message.error));
					else request?.resolve(message.result);
				},
			);
			const request = (type: string, data: Record<string, unknown> = {}) =>
				new Promise<unknown>((resolveRequest, reject) => {
					const current = ++requestId;
					pending.set(current, { resolve: resolveRequest, reject });
					child.send({ type, requestId: current, ...data }, (error) => {
						if (error) {
							pending.delete(current);
							reject(error);
						}
					});
				});
			const close = () => {
				closing ??= (async () => {
					if (child.exitCode !== null || child.signalCode !== null)
						throw new Error(
							"Node cleanup was not confirmed before process exit.",
						);
					await request("close");
					const code = await exited;
					if (code !== 0) throw new Error(`Node cleanup failed (${code}).`);
					emit({ nodeId: id, kind: "resource", state: "closed" });
				})();
				return closing;
			};
			own(close);
			emit({
				nodeId: id,
				kind: "resource",
				state: "starting",
				pid: child.pid,
				runtime: LabNodeKindEnum.node,
			});
			const result = await request("start", {
				nodeId: id,
				entry: absolute,
				snapshotDir,
				parameters,
			});
			emit({
				nodeId: id,
				kind: "resource",
				state: "active",
				pid: child.pid,
				runtime: LabNodeKindEnum.node,
			});
			return {
				id,
				kind: LabNodeKindEnum.node,
				result,
				close,
				call: <T>(exportName: string, ...args: readonly unknown[]) =>
					request("call", { exportName, args }) as Promise<T>,
			};
		},
		async browser(entry, parameters = {}) {
			if (!browserWSEndpoint)
				throw new Error(
					"A supervised Chromium endpoint is required for browser nodes.",
				);
			const absolute = entryPath(entry);
			const id = `browser-${++nextId}`;
			let browser: Browser | undefined;
			let context: BrowserContext | undefined;
			let modules:
				| Awaited<ReturnType<typeof createLabBrowserModules>>
				| undefined;
			let closing: Promise<void> | undefined;
			const close = () => {
				closing ??= (async () => {
					try {
						if (browser) {
							if (context) {
								for (const page of context.pages())
									await page.evaluate(async () => {
										await (
											globalThis as unknown as {
												__lab: { close(): Promise<void> };
											}
										).__lab?.close();
									});
								await context.close();
							}
							await browser.close();
						}
					} finally {
						await modules?.close();
					}
					emit({ nodeId: id, kind: "resource", state: "closed" });
				})();
				return closing;
			};
			own(close);
			browser = await chromium.connect(browserWSEndpoint);
			context = await browser.newContext();
			const page = await context.newPage();
			await page.exposeFunction("__labEmit", (data: unknown) =>
				emit({ nodeId: id, kind: LabNodeKindEnum.browser, data }),
			);
			page.on("console", (message) =>
				emit({ nodeId: id, kind: "console", message: message.text() }),
			);
			page.on("pageerror", (error) =>
				emit({ nodeId: id, kind: "error", message: error.stack }),
			);
			modules = await createLabBrowserModules({
				nodeId: id,
				snapshotDir,
				entry: absolute,
				parameters,
				onError: (error) =>
					emit({
						nodeId: id,
						kind: "error",
						message: error instanceof Error ? error.stack : String(error),
					}),
			});
			await page.goto(modules.origin);
			await page.addScriptTag({
				url: `${modules.origin}/bootstrap.js`,
				type: "module",
			});
			const result = await page.evaluate(async () => {
				const lab = (
					globalThis as unknown as {
						__lab: {
							module: { labNode(context: unknown): unknown };
							context: unknown;
						};
					}
				).__lab;
				if (typeof lab.module.labNode !== "function")
					throw new TypeError(
						"Browser module must export a labNode(context) function.",
					);
				return await lab.module.labNode(lab.context);
			});
			emit({
				nodeId: id,
				kind: "resource",
				state: "active",
				runtime: LabNodeKindEnum.browser,
				userAgent: await page.evaluate(() => navigator.userAgent),
				version: browser.version(),
			});
			const node: ILabNode = {
				id,
				kind: LabNodeKindEnum.browser,
				result,
				close,
				async call<T>(exportName: string, ...args: readonly unknown[]) {
					return (await page.evaluate(
						async ({ exportName, args }) => {
							const module = (
								globalThis as unknown as {
									__lab: {
										module: Record<
											string,
											(...args: readonly unknown[]) => unknown
										>;
									};
								}
							).__lab.module;
							const operation = module[exportName];
							if (typeof operation !== "function")
								throw new TypeError(`No callable export: ${exportName}`);
							return await operation(...args);
						},
						{ exportName, args },
					)) as T;
				},
			};
			return node;
		},
	};
}
