/**
 * @overview Shared package/packed-consumers fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../..",
);

export const fixtureRoot = mkdtempSync(join(tmpdir(), "husky-di-remote-pack-"));

export const tscPath = resolve(packageRoot, "node_modules/typescript/bin/tsc");

export const esbuildPath = resolve(packageRoot, "node_modules/.bin/esbuild");

export const tarballPaths = new Map<string, string>();

export const nodeRuntimeExportAssertions = `assert.deepEqual(Object.keys(root).sort(), ["RpcAcceptorListenerStopReasonEnum", "RpcCallDirectionEnum", "RpcCallStatusEnum", "RpcCloseOutcomeEnum", "RpcCloseReasonEnum", "RpcConnectorReconnectionAttemptFailureStageEnum", "RpcConnectorReconnectionEventTypeEnum", "RpcConnectorReconnectionStopReasonEnum", "RpcEventTypeEnum", "RpcException", "RpcExceptionCodeEnum", "RpcStateStatusEnum", "createRemoteServiceDescriptor", "createRpcAcceptor", "createRpcConnector", "createRpcConnectorReconnection", "createRpcProtocolAcceptor", "createRpcProtocolConnector"]);
assert.equal(new root.RpcException(root.RpcExceptionCodeEnum.unavailable).code, "unavailable");
assert.equal(root.RpcCallDirectionEnum.incoming, "incoming");
assert.deepEqual(Object.keys(protocol).sort(), ["RpcCallTerminalTypeEnum", "RpcCloseReasonEnum", "RpcExceptionCodeEnum", "RpcIncomingCallKindEnum", "RpcProtocolSessionTransitionTypeEnum", "createRpcProtocolAcceptor", "createRpcProtocolConnector"]);
assert.equal(protocol.RpcCloseReasonEnum.cleanupFailed, "cleanup-failed");
assert.equal(root.createRpcProtocolAcceptor, protocol.createRpcProtocolAcceptor);
assert.equal(root.createRpcProtocolConnector, protocol.createRpcProtocolConnector);
assert.deepEqual(Object.keys(transport), []);
assert.deepEqual(Object.keys(conformance).sort(), ["RpcConformanceStatusEnum", "runRpcAcceptorAdapterConformance", "runRpcConnectorAdapterConformance", "runRpcProtocolConformance"]);`;

export function run(
	command: string,
	args: readonly string[],
	cwd: string,
): string {
	return execFileSync(command, args, {
		cwd,
		encoding: "utf8",
		timeout: 30_000,
		env: { ...process.env, CI: "1" },
	});
}

export function runPnpm(args: readonly string[], cwd: string): string {
	const npmExecPath = process.env.npm_execpath;
	return npmExecPath === undefined
		? run("pnpm", args, cwd)
		: run(process.execPath, [npmExecPath, ...args], cwd);
}

export function createConsumer(
	name: string,
	type: "module" | "commonjs" = "module",
): string {
	const consumerRoot = resolve(fixtureRoot, name);
	mkdirSync(consumerRoot);
	writeFileSync(
		resolve(consumerRoot, "package.json"),
		JSON.stringify({
			private: true,
			type,
			dependencies: Object.fromEntries(
				[...tarballPaths].map(([name, path]) => [
					`@husky-di/${name}`,
					`file:${path}`,
				]),
			),
		}),
	);
	for (const [name, path] of tarballPaths) {
		const installed = resolve(consumerRoot, "node_modules/@husky-di", name);
		mkdirSync(installed, { recursive: true });
		run(
			"tar",
			["-xzf", path, "-C", installed, "--strip-components=1"],
			consumerRoot,
		);
	}
	// Only third-party dependencies are reused; both workspace packages come from pnpm pack artifacts.
	for (const name of ["rxjs", "zod"]) {
		symlinkSync(
			realpathSync(resolve(packageRoot, "node_modules", name)),
			resolve(consumerRoot, "node_modules", name),
			"dir",
		);
	}
	return consumerRoot;
}

export function listFiles(root: string, prefix = ""): string[] {
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const relativePath = join(prefix, entry.name);
		return entry.isDirectory()
			? listFiles(resolve(root, entry.name), relativePath)
			: [relativePath];
	});
}
