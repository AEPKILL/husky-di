/**
 * @overview Installed pnpm-pack artifact compatibility tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = mkdtempSync(join(tmpdir(), "husky-di-remote-pack-"));
const tscPath = resolve(packageRoot, "node_modules/typescript/bin/tsc");
const esbuildPath = resolve(packageRoot, "node_modules/.bin/esbuild");
let tarballPath = "";

function run(command: string, args: readonly string[], cwd: string): string {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, CI: "1" },
	});
	if (result.status !== 0) {
		throw new Error(
			[
				`Command failed: ${command} ${args.join(" ")}`,
				result.stdout,
				result.stderr,
			].join("\n"),
		);
	}
	return result.stdout;
}

function runPnpm(args: readonly string[], cwd: string): string {
	const npmExecPath = process.env.npm_execpath;
	return npmExecPath === undefined
		? run("pnpm", args, cwd)
		: run(process.execPath, [npmExecPath, ...args], cwd);
}

function createConsumer(
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
			dependencies: { "@husky-di/remote": `file:${tarballPath}` },
		}),
	);
	runPnpm(
		[
			"install",
			"--ignore-workspace",
			"--no-frozen-lockfile",
			"--ignore-scripts",
			"--prefer-offline",
		],
		consumerRoot,
	);
	return consumerRoot;
}

function listFiles(root: string, prefix = ""): string[] {
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const relativePath = join(prefix, entry.name);
		return entry.isDirectory()
			? listFiles(resolve(root, entry.name), relativePath)
			: [relativePath];
	});
}

beforeAll(() => {
	runPnpm(["pack", "--pack-destination", fixtureRoot, "--json"], packageRoot);
	const tarballName = readdirSync(fixtureRoot).find((name) =>
		name.endsWith(".tgz"),
	);
	if (tarballName === undefined) {
		throw new Error("pnpm pack did not create a tarball.");
	}
	tarballPath = resolve(fixtureRoot, tarballName);
}, 120_000);

afterAll(() => {
	if (basename(fixtureRoot).startsWith("husky-di-remote-pack-")) {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

describe("installed @husky-di/remote package", () => {
	it("RPC-PKG-005 RPC-PKG-006 RPC-RELEASE-004 publish only the declared portable artifact", () => {
		const consumerRoot = createConsumer("artifact");
		const installedRoot = resolve(
			consumerRoot,
			"node_modules/@husky-di/remote",
		);
		const manifestText = readFileSync(
			resolve(installedRoot, "package.json"),
			"utf8",
		);
		const manifest = JSON.parse(manifestText) as {
			readonly dependencies: Readonly<Record<string, string>>;
			readonly devDependencies?: Readonly<Record<string, string>>;
			readonly engines: { readonly node: string };
			readonly exports: Readonly<Record<string, unknown>>;
			readonly optionalDependencies?: Readonly<Record<string, string>>;
			readonly peerDependencies?: Readonly<Record<string, string>>;
			readonly publishConfig: { readonly access: string };
			readonly sideEffects: boolean;
			readonly type: string;
		};

		expect(manifest).toMatchObject({
			type: "module",
			sideEffects: false,
			engines: { node: ">=23.6" },
			publishConfig: { access: "public" },
		});
		expect(Object.keys(manifest.dependencies).sort()).toEqual([
			"@husky-di/core",
			"rxjs",
		]);
		expect(manifest).not.toHaveProperty("devDependencies");
		const publishedDependencyNames = [
			...Object.keys(manifest.dependencies),
			...Object.keys(manifest.optionalDependencies ?? {}),
			...Object.keys(manifest.peerDependencies ?? {}),
		];
		expect(publishedDependencyNames).not.toEqual(
			expect.arrayContaining(["@playwright/test", "vitest", "ws"]),
		);
		expect(manifestText).not.toContain("workspace:");
		expect(Object.keys(manifest.exports).sort()).toEqual([
			".",
			"./conformance",
			"./protocol",
			"./transport",
			"./wire/husky-di-rpc-1/schema",
			"./wire/husky-di-rpc-1/security-vectors",
			"./wire/husky-di-rpc-1/transcripts",
			"./wire/husky-di-rpc-1/vectors",
		]);
		expect(readdirSync(installedRoot).sort()).toEqual([
			"CHANGELOG.md",
			"LICENSE",
			"README.md",
			"dist",
			"docs",
			"package.json",
			"wire",
		]);
		expect(readdirSync(resolve(installedRoot, "docs")).sort()).toEqual([
			"ARCHITECTURE.drawio",
			"ARCHITECTURE.png",
			"PROTOCOL.md",
			"REQUIREMENTS.md",
			"SPECIFICATION.md",
			"TRANSPORT.md",
		]);
		expect(
			readdirSync(resolve(installedRoot, "wire/husky-di-rpc-1")).sort(),
		).toEqual([
			"known-answer-vectors.json",
			"raw-vectors.json",
			"schema.json",
			"transcripts.json",
		]);
		expect(listFiles(installedRoot)).not.toEqual(
			expect.arrayContaining([
				"src/index.ts",
				"tests/specification.test.ts",
				"examples/user-facing-rpc-interface/rpc-interface.ts",
			]),
		);
		const artifactFiles = listFiles(installedRoot);
		expect(artifactFiles).toEqual(
			expect.arrayContaining([
				"dist/index.cjs.map",
				"dist/impls/rpc-acceptor.impl.js.map",
				"dist/impls/rpc-connector.impl.js.map",
				"dist/impls/rpc-peer.impl.js.map",
			]),
		);
		for (const entry of artifactFiles.filter((path) =>
			path.endsWith(".js.map"),
		)) {
			expect(artifactFiles, `${entry} target`).toContain(entry.slice(0, -4));
		}
	});

	it("RPC-PKG-001 RPC-PKG-004 RPC-PKG-007 RPC-PKG-009 RPC-RELEASE-003 resolve every public subpath in Node ESM", () => {
		const consumerRoot = createConsumer("node-esm");
		const entryPath = resolve(consumerRoot, "index.mjs");
		writeFileSync(
			entryPath,
			`import assert from "node:assert/strict";
import * as root from "@husky-di/remote";
import * as protocol from "@husky-di/remote/protocol";
import * as transport from "@husky-di/remote/transport";
import * as conformance from "@husky-di/remote/conformance";

assert.deepEqual(Object.keys(root).sort(), ["RpcAcceptorListenerStopReasonEnum", "RpcCallDirectionEnum", "RpcCallStatusEnum", "RpcCloseOutcomeEnum", "RpcCloseReasonEnum", "RpcEventTypeEnum", "RpcException", "RpcExceptionCodeEnum", "RpcStateStatusEnum", "createRemoteServiceDescriptor", "createRpcAcceptor", "createRpcConnector", "createRpcProtocol"]);
assert.equal(new root.RpcException(root.RpcExceptionCodeEnum.unavailable).code, "unavailable");
assert.equal(root.RpcCallDirectionEnum.incoming, "incoming");
assert.deepEqual(Object.keys(protocol).sort(), ["RpcCallTerminalTypeEnum", "RpcCloseReasonEnum", "RpcExceptionCodeEnum", "RpcIncomingCallKindEnum", "RpcProtocolSessionTransitionTypeEnum", "createRpcProtocol"]);
assert.equal(protocol.RpcCloseReasonEnum.cleanupFailed, "cleanup-failed");
assert.equal(Object.isFrozen(protocol.createRpcProtocol()), true);
assert.deepEqual(Object.keys(transport), []);
assert.deepEqual(Object.keys(conformance).sort(), ["RpcConformanceStatusEnum", "runRpcAcceptorAdapterConformance", "runRpcConnectorAdapterConformance", "runRpcProtocolConformance"]);
for (const subpath of ["schema", "vectors", "transcripts", "security-vectors"]) {
  const asset = await import("@husky-di/remote/wire/husky-di-rpc-1/" + subpath, { with: { type: "json" } });
  assert.equal(typeof asset.default, "object");
}
await assert.rejects(
  import("@husky-di/remote/dist/impls/rpc-connector.impl.js"),
  (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
`,
		);
		run(process.execPath, [entryPath], consumerRoot);
	});

	it("RPC-PKG-001 RPC-PKG-004 RPC-PKG-007 RPC-PKG-009 RPC-RELEASE-003 resolve every public subpath in Node CJS", () => {
		const consumerRoot = createConsumer("node-cjs", "commonjs");
		const entryPath = resolve(consumerRoot, "index.cjs");
		writeFileSync(
			entryPath,
			`const assert = require("node:assert/strict");
const root = require("@husky-di/remote");
const protocol = require("@husky-di/remote/protocol");
const transport = require("@husky-di/remote/transport");
const conformance = require("@husky-di/remote/conformance");

assert.deepEqual(Object.keys(root).sort(), ["RpcAcceptorListenerStopReasonEnum", "RpcCallDirectionEnum", "RpcCallStatusEnum", "RpcCloseOutcomeEnum", "RpcCloseReasonEnum", "RpcEventTypeEnum", "RpcException", "RpcExceptionCodeEnum", "RpcStateStatusEnum", "createRemoteServiceDescriptor", "createRpcAcceptor", "createRpcConnector", "createRpcProtocol"]);
assert.equal(new root.RpcException(root.RpcExceptionCodeEnum.unavailable).code, "unavailable");
assert.equal(root.RpcCallDirectionEnum.incoming, "incoming");
assert.deepEqual(Object.keys(protocol).sort(), ["RpcCallTerminalTypeEnum", "RpcCloseReasonEnum", "RpcExceptionCodeEnum", "RpcIncomingCallKindEnum", "RpcProtocolSessionTransitionTypeEnum", "createRpcProtocol"]);
assert.equal(protocol.RpcCloseReasonEnum.cleanupFailed, "cleanup-failed");
assert.equal(Object.isFrozen(protocol.createRpcProtocol()), true);
assert.deepEqual(Object.keys(transport), []);
assert.deepEqual(Object.keys(conformance).sort(), ["RpcConformanceStatusEnum", "runRpcAcceptorAdapterConformance", "runRpcConnectorAdapterConformance", "runRpcProtocolConformance"]);
for (const subpath of ["schema", "vectors", "transcripts", "security-vectors"]) {
  assert.equal(typeof require("@husky-di/remote/wire/husky-di-rpc-1/" + subpath), "object");
}
assert.throws(
  () => require("@husky-di/remote/dist/impls/rpc-connector.impl.cjs"),
  (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
`,
		);
		run(process.execPath, [entryPath], consumerRoot);
	});

	it("RPC-PKG-001 RPC-PKG-002 RPC-PKG-008 RPC-PKG-009 RPC-RELEASE-001 RPC-RELEASE-003 compile installed strict declarations", () => {
		const consumerRoot = createConsumer("declarations");
		writeFileSync(
			resolve(consumerRoot, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					lib: ["ES2023", "DOM"],
					module: "ESNext",
					moduleResolution: "Bundler",
					noEmit: true,
					skipLibCheck: false,
					strict: true,
					types: [],
				},
				include: ["index.ts"],
			}),
		);
		writeFileSync(
			resolve(consumerRoot, "index.ts"),
			`import { RpcAcceptorListenerStopReasonEnum, RpcCallDirectionEnum, RpcCallStatusEnum, RpcCloseOutcomeEnum, RpcCloseReasonEnum, RpcEventTypeEnum, RpcException, RpcExceptionCodeEnum, RpcStateStatusEnum, createRemoteServiceDescriptor, createRpcAcceptor, createRpcConnector } from "@husky-di/remote";
import { RpcCallTerminalTypeEnum, RpcIncomingCallKindEnum, RpcProtocolSessionTransitionTypeEnum } from "@husky-di/remote/protocol";
import type {
  IRemoteServiceDescriptor, IRpcPeer, IRpcConnector, IRpcAcceptor, RpcPeerResult,
  RpcPeerState, RpcConnectorState, RpcAcceptorListenerState, RpcAcceptorState,
  RpcEvent,
  RpcConnectorOptions, RpcAcceptorOptions, RpcConnectorRuntimePolicyOptions,
  RpcAcceptorRuntimePolicyOptions, IRpcConnection as RootConnection,
  IRpcConnectorAdapter, IRpcAcceptorAdapter, IRpcProtocol as RootProtocol,
  IRpcProtocolRuntimePolicy, IRpcApplicationRecord, RpcApplicationValue,
  RpcCallFailure, RpcProtocolFaultReason, RpcSessionCloseReason,
} from "@husky-di/remote";
import type {
  IRpcConnection as ProtocolConnection, IRpcApplicationArgumentsSnapshot,
  IRpcApplicationRecord as ProtocolApplicationRecord, IRpcApplicationSnapshot,
  IRpcProtocol, IRpcProtocolAcceptorHost,
  IRpcProtocolAcceptorRuntime, IRpcProtocolConnectorHost,
  IRpcProtocolConnectorRuntime, IRpcProtocolHost, IRpcProtocolIncomingCall,
  IRpcProtocolIncomingCallRequest, IRpcProtocolIncomingCallReservation,
  IRpcProtocolIncomingHandlerCall, IRpcProtocolInvocation,
  IRpcProtocolInvocationRequest, IRpcProtocolInvocationReservation,
  IRpcProtocolInvocationSink, IRpcProtocolRoleRuntime,
  IRpcProtocolRuntimePolicy as ProtocolRuntimePolicy, IRpcProtocolSession,
  IRpcProtocolSessionHost, RpcCallOutcome, RpcHandlerOutcome,
  RpcApplicationValue as ProtocolApplicationValue,
  RpcCallFailure as ProtocolCallFailure, RpcIncomingFailure,
  RpcIncomingTerminal, RpcProtocolFaultReason as ProtocolFaultReason,
  RpcProtocolIncomingCallReservation,
  RpcProtocolSessionTransition, RpcProtocolSessionTransitionCloseReason,
  RpcSessionCloseReason as ProtocolSessionCloseReason, RpcUnknownCallFailure,
} from "@husky-di/remote/protocol";
import type {
  IRpcAcceptorAdapter as TransportAcceptorAdapter,
  IRpcConnection as TransportConnection,
  IRpcConnectorAdapter as TransportConnectorAdapter,
} from "@husky-di/remote/transport";
import {
  RpcConformanceStatusEnum,
  runRpcAcceptorAdapterConformance, runRpcConnectorAdapterConformance,
  runRpcProtocolConformance,
} from "@husky-di/remote/conformance";
import type {
  IRpcAcceptorAdapterConformanceFixture, IRpcAdapterConformanceRemote,
  IRpcConnectorAdapterConformanceFixture, IRpcProtocolConformanceFixture,
  RpcConformanceCaseResult, RpcConformanceFailure, RpcConformanceOptions,
  RpcConformanceReport,
} from "@husky-di/remote/conformance";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const rootProtocolIdentity: Equal<RootProtocol, IRpcProtocol> = true;
const connectionIdentity: Equal<RootConnection, ProtocolConnection & TransportConnection> = true;
const adapterIdentity: Equal<
  IRpcConnectorAdapter & IRpcAcceptorAdapter,
  TransportConnectorAdapter & TransportAcceptorAdapter
> = true;
const protocolSharedIdentity: Equal<
  IRpcApplicationRecord & IRpcProtocolRuntimePolicy & RpcApplicationValue,
  ProtocolApplicationRecord & ProtocolRuntimePolicy & ProtocolApplicationValue
> = true;
const callerException = new RpcException(RpcExceptionCodeEnum.unavailable);
const callDirection: RpcCallDirectionEnum = RpcCallDirectionEnum.incoming;
const closeReason: RpcCloseReasonEnum = RpcCloseReasonEnum.cleanupFailed;
void [
	RpcAcceptorListenerStopReasonEnum, RpcCallDirectionEnum, RpcCallStatusEnum,
	RpcCallTerminalTypeEnum, RpcCloseOutcomeEnum, RpcCloseReasonEnum, RpcEventTypeEnum,
	RpcException, RpcExceptionCodeEnum, RpcIncomingCallKindEnum,
	RpcProtocolSessionTransitionTypeEnum, RpcStateStatusEnum,
	createRemoteServiceDescriptor, createRpcAcceptor, createRpcConnector,
	RpcConformanceStatusEnum, runRpcAcceptorAdapterConformance, runRpcConnectorAdapterConformance,
	runRpcProtocolConformance, rootProtocolIdentity, connectionIdentity,
	adapterIdentity, protocolSharedIdentity, callerException, callDirection, closeReason,
];
type Inventory = [
  IRemoteServiceDescriptor<unknown, never>, IRpcPeer, IRpcConnector, IRpcAcceptor,
  RpcPeerResult<unknown>, RpcPeerState, RpcConnectorState, RpcAcceptorListenerState,
  RpcAcceptorState, RpcCloseReasonEnum, RpcCallDirectionEnum, RpcEvent, RpcExceptionCodeEnum,
  RpcConnectorOptions, RpcAcceptorOptions, RpcConnectorRuntimePolicyOptions,
  RpcAcceptorRuntimePolicyOptions, IRpcConnectorAdapter, IRpcAcceptorAdapter,
  IRpcProtocolRuntimePolicy, IRpcApplicationRecord, RpcApplicationValue,
  RpcCallFailure, RpcProtocolFaultReason, RpcSessionCloseReason,
  IRpcApplicationArgumentsSnapshot, IRpcApplicationSnapshot,
  IRpcProtocolAcceptorHost, IRpcProtocolAcceptorRuntime, IRpcProtocolConnectorHost,
  IRpcProtocolConnectorRuntime, IRpcProtocolHost, IRpcProtocolIncomingCall,
  IRpcProtocolIncomingCallRequest, IRpcProtocolIncomingCallReservation,
  IRpcProtocolIncomingHandlerCall, IRpcProtocolInvocation,
  IRpcProtocolInvocationRequest, IRpcProtocolInvocationReservation,
  IRpcProtocolInvocationSink, IRpcProtocolRoleRuntime, IRpcProtocolSession,
  IRpcProtocolSessionHost, RpcCallOutcome, RpcHandlerOutcome, RpcIncomingFailure,
  RpcIncomingTerminal, RpcProtocolIncomingCallReservation,
  RpcProtocolSessionTransition, RpcProtocolSessionTransitionCloseReason,
  RpcUnknownCallFailure, IRpcAcceptorAdapterConformanceFixture,
  IRpcAdapterConformanceRemote, IRpcConnectorAdapterConformanceFixture,
  IRpcProtocolConformanceFixture, RpcConformanceCaseResult, RpcConformanceFailure,
  RpcConformanceOptions, RpcConformanceReport, ProtocolCallFailure,
  ProtocolFaultReason, ProtocolSessionCloseReason,
];
declare const inventory: Inventory;
void inventory;
// @ts-expect-error The built-in Protocol is private.
import { defaultRpcProtocol } from "@husky-di/remote";
// @ts-expect-error Descriptor mapped helpers are private.
import type { RemoteService, RpcMethodDefinitions } from "@husky-di/remote";
// @ts-expect-error Concrete implementation classes are private.
import type { RpcConnectorImpl as RootRpcConnectorImpl } from "@husky-di/remote";
// @ts-expect-error Implementation deep imports are private.
import type { RpcConnectorImpl as DeepRpcConnectorImpl } from "@husky-di/remote/dist/impls/rpc-connector.impl.js";
`,
		);
		run(process.execPath, [tscPath, "-p", consumerRoot], consumerRoot);
	});

	it("RPC-RELEASE-001 RPC-RELEASE-003 compiles an installed DOM-only consumer and browser bundle", () => {
		const consumerRoot = createConsumer("browser-bundle");
		writeFileSync(
			resolve(consumerRoot, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					lib: ["ES2023", "DOM", "DOM.Iterable"],
					module: "ESNext",
					moduleResolution: "Bundler",
					noEmit: true,
					skipLibCheck: false,
					strict: true,
					types: [],
				},
				include: ["index.ts"],
			}),
		);
		const entryPath = resolve(consumerRoot, "index.ts");
		writeFileSync(
			entryPath,
			`import { createRpcConnector } from "@husky-di/remote";
import type { IRpcProtocol } from "@husky-di/remote/protocol";
import type { IRpcConnectorAdapter } from "@husky-di/remote/transport";
import { runRpcConnectorAdapterConformance } from "@husky-di/remote/conformance";
import schema from "@husky-di/remote/wire/husky-di-rpc-1/schema";

declare const connection$: IRpcConnectorAdapter["connection$"];
declare const protocol: IRpcProtocol;
const adapter: IRpcConnectorAdapter = {
  connection$,
  async connect(signal: AbortSignal) { signal.throwIfAborted(); },
};
void [createRpcConnector({ protocol }), adapter, runRpcConnectorAdapterConformance, schema];
`,
		);
		run(process.execPath, [tscPath, "-p", consumerRoot], consumerRoot);
		const bundlePath = resolve(consumerRoot, "bundle.js");
		run(
			esbuildPath,
			[
				entryPath,
				"--bundle",
				"--format=esm",
				"--platform=browser",
				`--outfile=${bundlePath}`,
			],
			consumerRoot,
		);
		expect(existsSync(bundlePath)).toBe(true);
		expect(readFileSync(bundlePath, "utf8")).not.toMatch(
			/\b(?:Buffer|node:|require\()["']?/,
		);
	});
});
