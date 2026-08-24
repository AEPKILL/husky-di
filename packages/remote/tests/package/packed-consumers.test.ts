/**
 * @overview Installed pnpm-pack artifact compatibility tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { execFileSync } from "node:child_process";
import { createHash, createHmac, hkdfSync } from "node:crypto";
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
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const coreRoot = resolve(packageRoot, "../core");
const fixtureRoot = mkdtempSync(join(tmpdir(), "husky-di-remote-pack-"));
const tscPath = resolve(packageRoot, "node_modules/typescript/bin/tsc");
const esbuildPath = resolve(packageRoot, "node_modules/.bin/esbuild");
let tarballPath = "";
let coreTarballPath = "";

const declarationInventories = {
	root: {
		runtime: [
			"RpcAcceptorListenerStopReasonEnum",
			"RpcCallStatusEnum",
			"RpcCloseOutcomeEnum",
			"RpcCloseReasonEnum",
			"RpcConnectorReconnectionAttemptFailureStageEnum",
			"RpcConnectorReconnectionEventTypeEnum",
			"RpcConnectorReconnectionStopReasonEnum",
			"RpcEventDirectionEnum",
			"RpcEventTypeEnum",
			"RpcException",
			"RpcExceptionCodeEnum",
			"RpcStateStatusEnum",
			"RpcStreamStatusEnum",
			"createRemoteServiceDescriptor",
			"createRpcAcceptor",
			"createRpcConnector",
			"createRpcConnectorReconnection",
			"createRpcProtocol",
		],
		typeOnly: [
			"CreateRpcConnectorReconnectionOptions",
			"IRemoteServiceDescriptor",
			"IRpcAcceptor",
			"IRpcAcceptorAdapter",
			"IRpcApplicationRecord",
			"IRpcConnection",
			"IRpcConnector",
			"IRpcConnectorAdapter",
			"IRpcConnectorReconnection",
			"IRpcPeer",
			"IRpcProtocol",
			"IRpcProtocolRuntimePolicy",
			"RpcAcceptorListenerState",
			"RpcAcceptorOptions",
			"RpcAcceptorRuntimePolicyOptions",
			"RpcAcceptorState",
			"RpcApplicationValue",
			"RpcCallFailure",
			"RpcConnectorAdapterFactory",
			"RpcConnectorConnectOptions",
			"RpcConnectorOptions",
			"RpcConnectorReconnectionEvent",
			"RpcConnectorReconnectionPolicyOptions",
			"RpcConnectorReconnectionState",
			"RpcConnectorRuntimePolicyOptions",
			"RpcConnectorState",
			"RpcEvent",
			"RpcPeerState",
			"RpcProtocolFaultReason",
			"RpcSessionCloseReason",
		],
	},
	protocol: {
		runtime: [
			"RpcCallTerminalTypeEnum",
			"RpcCloseReasonEnum",
			"RpcExceptionCodeEnum",
			"RpcIncomingCallKindEnum",
			"RpcProtocolSessionTransitionTypeEnum",
			"createRpcProtocol",
		],
		typeOnly: [
			"IRpcApplicationArgumentsSnapshot",
			"IRpcApplicationRecord",
			"IRpcApplicationSnapshot",
			"IRpcConnection",
			"IRpcProtocol",
			"IRpcProtocolAcceptorHost",
			"IRpcProtocolAcceptorRuntime",
			"IRpcProtocolConnectorHost",
			"IRpcProtocolConnectorRuntime",
			"IRpcProtocolHost",
			"IRpcProtocolIncomingCall",
			"IRpcProtocolIncomingCallRequest",
			"IRpcProtocolIncomingCallReservation",
			"IRpcProtocolIncomingHandlerCall",
			"IRpcProtocolIncomingSourceReservation",
			"IRpcProtocolIncomingStream",
			"IRpcProtocolIncomingUnknownStreamReservation",
			"IRpcProtocolInvocation",
			"IRpcProtocolInvocationRequest",
			"IRpcProtocolInvocationReservation",
			"IRpcProtocolInvocationSink",
			"IRpcProtocolProjection",
			"IRpcProtocolRoleRuntime",
			"IRpcProtocolRuntimePolicy",
			"IRpcProtocolSession",
			"IRpcProtocolSessionHost",
			"IRpcProtocolSourceEmissionReservation",
			"IRpcProtocolSourceSink",
			"IRpcProtocolStream",
			"IRpcProtocolStreamReservation",
			"IRpcProtocolSubscriberSink",
			"IRpcRetainedBytesReservation",
			"RpcApplicationValue",
			"RpcCallFailure",
			"RpcCallOutcome",
			"RpcHandlerOutcome",
			"RpcIncomingFailure",
			"RpcIncomingStreamTerminal",
			"RpcIncomingTerminal",
			"RpcProtocolFaultReason",
			"RpcProtocolIncomingCallReservation",
			"RpcProtocolIncomingStreamReservation",
			"RpcProtocolSessionTransition",
			"RpcProtocolSessionTransitionCloseReason",
			"RpcProtocolStreamRequest",
			"RpcSessionCloseReason",
			"RpcSourceTerminal",
			"RpcStreamFailure",
			"RpcStreamItemEffect",
			"RpcStreamOutcome",
			"RpcUnknownCallFailure",
		],
	},
	transport: {
		runtime: [],
		typeOnly: ["IRpcAcceptorAdapter", "IRpcConnectorAdapter", "IRpcConnection"],
	},
	conformance: {
		runtime: [
			"RpcConformanceStatusEnum",
			"runRpcAcceptorAdapterConformance",
			"runRpcConnectorAdapterConformance",
			"runRpcProtocolConformance",
		],
		typeOnly: [
			"IRpcAcceptorAdapterConformanceFixture",
			"IRpcAdapterConformanceRemote",
			"IRpcConnectorAdapterConformanceFixture",
			"IRpcProtocolConformanceFixture",
			"RpcConformanceCaseResult",
			"RpcConformanceFailure",
			"RpcConformanceOptions",
			"RpcConformanceReport",
		],
	},
} as const;

const nodeRuntimeExportAssertions = `assert.deepEqual(Object.keys(root).sort(), ["RpcAcceptorListenerStopReasonEnum", "RpcCallStatusEnum", "RpcCloseOutcomeEnum", "RpcCloseReasonEnum", "RpcConnectorReconnectionAttemptFailureStageEnum", "RpcConnectorReconnectionEventTypeEnum", "RpcConnectorReconnectionStopReasonEnum", "RpcEventDirectionEnum", "RpcEventTypeEnum", "RpcException", "RpcExceptionCodeEnum", "RpcStateStatusEnum", "RpcStreamStatusEnum", "createRemoteServiceDescriptor", "createRpcAcceptor", "createRpcConnector", "createRpcConnectorReconnection", "createRpcProtocol"]);
assert.equal(new root.RpcException(root.RpcExceptionCodeEnum.unavailable).code, "unavailable");
assert.equal(root.RpcEventDirectionEnum.incoming, "incoming");
assert.equal(root.RpcStreamStatusEnum.terminated, "terminated");
assert.deepEqual(Object.keys(protocol).sort(), ["RpcCallTerminalTypeEnum", "RpcCloseReasonEnum", "RpcExceptionCodeEnum", "RpcIncomingCallKindEnum", "RpcProtocolSessionTransitionTypeEnum", "createRpcProtocol"]);
assert.equal(protocol.RpcCloseReasonEnum.cleanupFailed, "cleanup-failed");
assert.equal(Object.isFrozen(protocol.createRpcProtocol()), true);
assert.deepEqual(Object.keys(transport), []);
assert.deepEqual(Object.keys(conformance).sort(), ["RpcConformanceStatusEnum", "runRpcAcceptorAdapterConformance", "runRpcConnectorAdapterConformance", "runRpcProtocolConformance"]);
assert.equal(root.RpcCallDirectionEnum, undefined);
assert.equal(root.RpcPeerResult, undefined);
assert.equal(root.RemoteServiceGroup, undefined);
assert.equal(root.unknownMethod, undefined);
assert.equal(root.maxPendingInvocationsPerSession, undefined);
assert.equal(root.RpcExceptionCodeEnum.unknownMethod, undefined);
const acceptor = root.createRpcAcceptor();
assert.equal(acceptor.resolveAll, undefined);
assert.equal(acceptor.close(), acceptor.close());`;

function run(command: string, args: readonly string[], cwd: string): string {
	return execFileSync(command, args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, CI: "1" },
	});
}

function runPnpm(args: readonly string[], cwd: string): string {
	return run("corepack", ["pnpm", ...args], cwd);
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
			packageManager: "pnpm@11.13.1",
			dependencies: {
				"@husky-di/core": `file:${coreTarballPath}`,
				"@husky-di/remote": `file:${tarballPath}`,
				rxjs: "7.8.2",
			},
		}),
	);
	writeFileSync(
		resolve(consumerRoot, "pnpm-workspace.yaml"),
		`packages:\n  - "."\noverrides:\n  "@husky-di/core": "file:${coreTarballPath}"\n`,
	);
	runPnpm(
		["install", "--no-frozen-lockfile", "--ignore-scripts", "--prefer-offline"],
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
	const authoritativeCoreTarball = process.env.HUSKY_CORE_TGZ;
	if (authoritativeCoreTarball !== undefined) {
		if (!existsSync(authoritativeCoreTarball)) {
			throw new Error(
				`Support Core tarball does not exist: ${authoritativeCoreTarball}`,
			);
		}
		coreTarballPath = resolve(authoritativeCoreTarball);
	} else {
		run(
			process.execPath,
			[resolve(packageRoot, "scripts/finalize-declarations.mjs"), coreRoot],
			packageRoot,
		);
		runPnpm(["pack", "--pack-destination", fixtureRoot, "--json"], coreRoot);
		const coreTarballName = readdirSync(fixtureRoot).find(
			(name) => name.startsWith("husky-di-core-") && name.endsWith(".tgz"),
		);
		if (coreTarballName === undefined)
			throw new Error("pnpm pack did not create the Core support tarball.");
		coreTarballPath = resolve(fixtureRoot, coreTarballName);
	}
	const authoritativeTarball = process.env.HUSKY_REMOTE_TGZ;
	if (authoritativeTarball !== undefined) {
		if (!existsSync(authoritativeTarball)) {
			throw new Error(
				`Authoritative tarball does not exist: ${authoritativeTarball}`,
			);
		}
		tarballPath = resolve(authoritativeTarball);
		return;
	}
	runPnpm(["pack", "--pack-destination", fixtureRoot, "--json"], packageRoot);
	const tarballName = readdirSync(fixtureRoot).find(
		(name) => name.startsWith("husky-di-remote-") && name.endsWith(".tgz"),
	);
	if (tarballName === undefined)
		throw new Error("pnpm pack did not create a tarball.");
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
			"zod",
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
			expect.arrayContaining(["src/index.ts", "tests/specification.test.ts"]),
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

	it("RPC-SEC-001 packages the initiator authentication and admission boundary", () => {
		const consumerRoot = createConsumer("security-documentation");
		const installedRoot = resolve(
			consumerRoot,
			"node_modules/@husky-di/remote",
		);
		const documentation = [
			readFileSync(resolve(installedRoot, "README.md"), "utf8"),
			readFileSync(resolve(installedRoot, "docs/SPECIFICATION.md"), "utf8"),
		].join("\n");

		expect(documentation).toContain(
			"does not authenticate the initiating application",
		);
		expect(documentation).toContain("before Acceptor handoff");
		expect(documentation).toContain("per-principal connection");
	});

	it("RPC-CORPUS-005 RPC-CORPUS-010 verifies the installed four-tuple, JCS, and KAT", () => {
		const consumerRoot = createConsumer("installed-corpus");
		const installedRoot = resolve(
			consumerRoot,
			"node_modules/@husky-di/remote",
		);
		const wireRoot = resolve(installedRoot, "wire/husky-di-rpc-1");
		const names = [
			"schema.json",
			"raw-vectors.json",
			"transcripts.json",
			"known-answer-vectors.json",
		] as const;
		const bytes = Object.fromEntries(
			names.map((name) => [name, readFileSync(resolve(wireRoot, name))]),
		);
		const tuple = Object.fromEntries(
			names.map((name) => [
				name,
				createHash("sha256").update(bytes[name]).digest("hex"),
			]),
		);
		expect(new Set(Object.values(tuple)).size).toBe(4);
		const raw = JSON.parse(bytes["raw-vectors.json"].toString("utf8"));
		const transcripts = JSON.parse(bytes["transcripts.json"].toString("utf8"));
		const kat = JSON.parse(bytes["known-answer-vectors.json"].toString("utf8"));
		expect(raw.profile).toBe("husky-di-rpc/1");
		expect(raw.vectors).toHaveLength(82);
		expect(transcripts.profile).toBe("husky-di-rpc/1");
		expect(
			transcripts.scenarios.flatMap(
				(scenario: { steps: unknown[] }) => scenario.steps,
			),
		).toHaveLength(68);
		const canonicalize = (value: unknown): string => {
			if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
			if (typeof value === "object" && value !== null) {
				return `{${Object.keys(value)
					.sort()
					.map(
						(key) =>
							`${JSON.stringify(key)}:${canonicalize(Reflect.get(value, key))}`,
					)
					.join(",")}}`;
			}
			return JSON.stringify(value);
		};
		for (const vector of kat.jcs)
			expect(canonicalize(vector.input)).toBe(vector.canonical);
		const hmac = createHmac("sha256", Buffer.from(kat.hmacSha256.keyHex, "hex"))
			.update(Buffer.from(kat.hmacSha256.dataHex, "hex"))
			.digest("hex");
		expect(hmac).toBe(kat.hmacSha256.tagHex);
		const hkdf = Buffer.from(
			hkdfSync(
				"sha256",
				Buffer.from(kat.hkdfSha256.ikmHex, "hex"),
				Buffer.from(kat.hkdfSha256.saltHex, "hex"),
				Buffer.from(kat.hkdfSha256.infoHex, "hex"),
				kat.hkdfSha256.length,
			),
		).toString("hex");
		expect(hkdf).toBe(kat.hkdfSha256.okmHex);
	});

	it("RPC-PKG-010 RPC-RELEASE-014 parses exact emitted declaration inventories", () => {
		const consumerRoot = createConsumer("compiler-api");
		const installedRoot = resolve(
			consumerRoot,
			"node_modules/@husky-di/remote",
		);
		const entryPaths = Object.fromEntries(
			["root", "protocol", "transport", "conformance"].map((name) => [
				name,
				resolve(installedRoot, `dist/${name === "root" ? "index" : name}.d.ts`),
			]),
		) as Record<keyof typeof declarationInventories, string>;
		const program = ts.createProgram({
			rootNames: Object.values(entryPaths),
			options: {
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				noEmit: true,
				skipLibCheck: false,
				strict: true,
				types: [],
			},
		});
		expect(
			ts
				.getPreEmitDiagnostics(program)
				.map((diagnostic) =>
					ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
				),
		).toEqual([]);
		const checker = program.getTypeChecker();
		for (const [name, expected] of Object.entries(declarationInventories)) {
			const source = program.getSourceFile(
				entryPaths[name as keyof typeof entryPaths],
			);
			if (source === undefined)
				throw new Error(`Missing declaration entry: ${name}`);
			const moduleSymbol = checker.getSymbolAtLocation(source);
			if (moduleSymbol === undefined)
				throw new Error(`Missing module symbol: ${name}`);
			const exports = checker.getExportsOfModule(moduleSymbol).map((symbol) => {
				const target =
					symbol.flags & ts.SymbolFlags.Alias
						? checker.getAliasedSymbol(symbol)
						: symbol;
				return {
					name: symbol.name,
					value: Boolean(target.flags & ts.SymbolFlags.Value),
				};
			});
			expect(
				exports
					.filter((item) => item.value)
					.map((item) => item.name)
					.sort(),
			).toEqual([...expected.runtime].sort());
			expect(
				exports
					.filter((item) => !item.value)
					.map((item) => item.name)
					.sort(),
			).toEqual([...expected.typeOnly].sort());
		}

		const rootSource = program.getSourceFile(entryPaths.root);
		const rootSymbol = rootSource && checker.getSymbolAtLocation(rootSource);
		const exceptionSymbol =
			rootSymbol &&
			checker
				.getExportsOfModule(rootSymbol)
				.find((symbol) => symbol.name === "RpcExceptionCodeEnum");
		if (exceptionSymbol === undefined)
			throw new Error("Missing RpcExceptionCodeEnum declaration.");
		const target = checker.getAliasedSymbol(exceptionSymbol);
		const declaration = target.declarations?.find(ts.isEnumDeclaration);
		if (declaration === undefined)
			throw new Error("Missing emitted enum declaration.");
		expect(
			Object.fromEntries(
				declaration.members.map((member) => [
					member.name.getText(),
					member.initializer !== undefined &&
					ts.isStringLiteral(member.initializer)
						? member.initializer.text
						: undefined,
				]),
			),
		).toEqual({
			canceled: "canceled",
			unavailable: "unavailable",
			outcomeUnknown: "outcome-unknown",
			handlerFailed: "handler-failed",
			unknownService: "unknown-service",
			unknownMember: "unknown-member",
			overflow: "overflow",
			protocol: "protocol",
		});
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

${nodeRuntimeExportAssertions}
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

${nodeRuntimeExportAssertions}
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

	it("RPC-CONFORMANCE-004 RPC-CONFORMANCE-005 runs installed Protocol and Transport conformance", () => {
		const consumerRoot = createConsumer("installed-conformance");
		const fixtureSource = readFileSync(
			resolve(packageRoot, "tests/conformance/test.utils.ts"),
			"utf8",
		)
			.replaceAll('"../../src/conformance"', '"@husky-di/remote/conformance"')
			.replaceAll('"../../src/index"', '"@husky-di/remote"')
			.replaceAll(
				'"../../src/interfaces/protocol/rpc-protocol.interface"',
				'"@husky-di/remote/protocol"',
			)
			.replaceAll(
				'"../../src/interfaces/rpc-adapter.interface"',
				'"@husky-di/remote/transport"',
			)
			.replaceAll(
				'"../../src/interfaces/rpc-connection.interface"',
				'"@husky-di/remote/transport"',
			)
			.replaceAll('"../../src/protocol"', '"@husky-di/remote/protocol"');
		writeFileSync(resolve(consumerRoot, "fixture.ts"), fixtureSource);
		writeFileSync(
			resolve(consumerRoot, "runner.ts"),
			`import assert from "node:assert/strict";
import {
  runRpcAcceptorAdapterConformance,
  runRpcConnectorAdapterConformance,
  runRpcProtocolConformance,
} from "@husky-di/remote/conformance";
import {
  createMemoryAcceptorFixture,
  createMemoryConnectorFixture,
  createMemoryProtocolFixture,
} from "./fixture";

const protocol = [];
const connector = [];
const acceptor = [];
await runRpcProtocolConformance(createMemoryProtocolFixture(), { report: (result) => protocol.push(result) });
await runRpcConnectorAdapterConformance(createMemoryConnectorFixture(), { report: (result) => connector.push(result) });
await runRpcAcceptorAdapterConformance(createMemoryAcceptorFixture(), { report: (result) => acceptor.push(result) });
assert.equal(protocol.length, 30);
assert.equal(connector.length, 10);
assert.equal(acceptor.length, 14);
assert.equal([...protocol, ...connector, ...acceptor].every((result) => result.status === "passed"), true);
`,
		);
		const bundlePath = resolve(consumerRoot, "runner.mjs");
		run(
			esbuildPath,
			[
				resolve(consumerRoot, "runner.ts"),
				"--bundle",
				"--format=esm",
				"--platform=node",
				"--packages=external",
				`--outfile=${bundlePath}`,
			],
			consumerRoot,
		);
		run(process.execPath, [bundlePath], consumerRoot);
	}, 30_000);

	it("RPC-STREAM-001 RPC-STREAM-002 RPC-RELEASE-009 runs an installed mixed stream smoke", () => {
		const consumerRoot = createConsumer("installed-stream");
		const entryPath = resolve(consumerRoot, "stream.mjs");
		writeFileSync(
			entryPath,
			`import assert from "node:assert/strict";
import { Observable, Subject, firstValueFrom, of, toArray } from "rxjs";
import { createRemoteServiceDescriptor, createRpcAcceptor, createRpcConnector } from "@husky-di/remote";

const accepted = new Subject();
const links = [];
const acceptorAdapter = { connection$: accepted.asObservable(), async listen(signal) { signal.throwIfAborted(); } };
const createConnectorAdapter = () => {
  const connected = new Subject();
  return {
    connection$: connected.asObservable(),
    async connect(signal) {
      signal.throwIfAborted();
      const connectorIngress = new Subject();
      const acceptorIngress = new Subject();
      let closed = false;
      const close = async () => {
        if (closed) return;
        closed = true;
        connectorIngress.complete();
        acceptorIngress.complete();
      };
      const connection = (ingress, remote) => ({
        message$: ingress.asObservable(),
        async send(bytes) {
          if (closed) throw new Error("closed");
          const snapshot = bytes.slice();
          await Promise.resolve();
          if (!closed) remote.next(snapshot);
        },
        close,
      });
      links.push(close);
      connected.next(connection(connectorIngress, acceptorIngress));
      accepted.next(connection(acceptorIngress, connectorIngress));
      connected.complete();
    },
  };
};
const descriptor = createRemoteServiceDescriptor({}, {
  wireName: "installed.stream.v1",
  members: {
    add: { kind: "unary" },
    count: { kind: "stream-method" },
    status$: { kind: "stream-property" },
  },
});
const acceptor = createRpcAcceptor({ runtimePolicy: { ackDelayMs: 1 } });
const connector = createRpcConnector({ runtimePolicy: { ackDelayMs: 1 } });
acceptor.expose(descriptor, {
  add: (left, right) => left + right,
  count(limit) {
    return new Observable((subscriber) => {
      let value = 0;
      const timer = setInterval(() => {
        subscriber.next(value++);
        if (value === limit) { clearInterval(timer); subscriber.complete(); }
      }, 4);
      return () => clearInterval(timer);
    });
  },
  status$: of("ready"),
});
await acceptor.listen(acceptorAdapter);
await connector.connect({ adapter: createConnectorAdapter() });
const remote = connector.peer.resolve(descriptor);
assert.equal(Object.isFrozen(remote), true);
assert.equal(Object.getPrototypeOf(remote), null);
assert.equal("then" in remote, false);
assert.equal(await remote.add(20, 22), 42);
assert.deepEqual(await firstValueFrom(remote.count(3).pipe(toArray())), [0, 1, 2]);
assert.equal(await firstValueFrom(remote.status$), "ready");
await connector.shutdown();
await acceptor.shutdown();
`,
		);
		run(process.execPath, [entryPath], consumerRoot);
	}, 30_000);

	it("RPC-PKG-001 RPC-PKG-002 RPC-RELEASE-016 compiles an installed strict NodeNext .mts consumer", () => {
		const consumerRoot = createConsumer("declarations");
		writeFileSync(
			resolve(consumerRoot, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					lib: ["ES2023", "DOM"],
					module: "NodeNext",
					moduleResolution: "NodeNext",
					noEmit: true,
					skipLibCheck: false,
					strict: true,
					types: [],
				},
				include: ["index.mts"],
			}),
		);
		writeFileSync(
			resolve(consumerRoot, "index.mts"),
			`import { RpcAcceptorListenerStopReasonEnum, RpcCallStatusEnum, RpcCloseOutcomeEnum, RpcCloseReasonEnum, RpcConnectorReconnectionAttemptFailureStageEnum, RpcConnectorReconnectionEventTypeEnum, RpcConnectorReconnectionStopReasonEnum, RpcEventDirectionEnum, RpcEventTypeEnum, RpcException, RpcExceptionCodeEnum, RpcStateStatusEnum, RpcStreamStatusEnum, createRemoteServiceDescriptor, createRpcAcceptor, createRpcConnector, createRpcConnectorReconnection } from "@husky-di/remote";
import { RpcCallTerminalTypeEnum, RpcIncomingCallKindEnum, RpcProtocolSessionTransitionTypeEnum } from "@husky-di/remote/protocol";
import type {
  IRemoteServiceDescriptor, IRpcPeer, IRpcConnector, IRpcConnectorReconnection,
  IRpcAcceptor,
  RpcPeerState, RpcConnectorState, RpcAcceptorListenerState, RpcAcceptorState,
  RpcEvent,
  RpcConnectorOptions, RpcConnectorConnectOptions, RpcAcceptorOptions,
  RpcConnectorRuntimePolicyOptions,
  RpcAcceptorRuntimePolicyOptions, IRpcConnection as RootConnection,
  IRpcConnectorAdapter, IRpcAcceptorAdapter, IRpcProtocol as RootProtocol,
  IRpcProtocolRuntimePolicy, IRpcApplicationRecord, RpcApplicationValue,
  RpcCallFailure, RpcProtocolFaultReason, RpcSessionCloseReason,
  CreateRpcConnectorReconnectionOptions, RpcConnectorAdapterFactory,
  RpcConnectorReconnectionEvent, RpcConnectorReconnectionPolicyOptions,
  RpcConnectorReconnectionState,
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
  IRpcProtocolSessionHost, IRpcRetainedBytesReservation, RpcCallOutcome, RpcHandlerOutcome,
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
const eventDirection: RpcEventDirectionEnum = RpcEventDirectionEnum.incoming;
const streamStatus: RpcStreamStatusEnum = RpcStreamStatusEnum.completed;
const closeReason: RpcCloseReasonEnum = RpcCloseReasonEnum.cleanupFailed;
declare const connectorAdapter: IRpcConnectorAdapter;
declare const connector: IRpcConnector;
const connectorConnectOptions: RpcConnectorConnectOptions = {
  adapter: connectorAdapter,
  signal: new AbortController().signal,
};
const adapterFactory: RpcConnectorAdapterFactory = () => connectorAdapter;
const reconnectionPolicy: RpcConnectorReconnectionPolicyOptions = {
  retryDelaysMs: [100, 200],
  attemptTimeoutMs: 1_000,
};
const reconnectionOptions: CreateRpcConnectorReconnectionOptions = {
  connector,
  adapterFactory,
  policy: reconnectionPolicy,
};
const reconnection: IRpcConnectorReconnection =
  createRpcConnectorReconnection(reconnectionOptions);
const reconnectionState: RpcConnectorReconnectionState = reconnection.state;
const reconnectionEvent: RpcConnectorReconnectionEvent = {
  type: RpcConnectorReconnectionEventTypeEnum.attemptFailed,
  attempt: 1,
  stage: RpcConnectorReconnectionAttemptFailureStageEnum.connectorAttempt,
  nextDelayMs: 100,
};
void connector.connect(connectorConnectOptions);
void [
	RpcAcceptorListenerStopReasonEnum, RpcCallStatusEnum,
	RpcCallTerminalTypeEnum, RpcCloseOutcomeEnum, RpcCloseReasonEnum, RpcEventTypeEnum,
	RpcEventDirectionEnum, RpcStreamStatusEnum,
	RpcException, RpcExceptionCodeEnum, RpcIncomingCallKindEnum,
	RpcProtocolSessionTransitionTypeEnum, RpcStateStatusEnum,
	RpcConnectorReconnectionAttemptFailureStageEnum,
	RpcConnectorReconnectionEventTypeEnum,
	RpcConnectorReconnectionStopReasonEnum,
	createRemoteServiceDescriptor, createRpcAcceptor, createRpcConnector,
	createRpcConnectorReconnection,
	RpcConformanceStatusEnum, runRpcAcceptorAdapterConformance, runRpcConnectorAdapterConformance,
	runRpcProtocolConformance, rootProtocolIdentity, connectionIdentity,
	adapterIdentity, protocolSharedIdentity, callerException, eventDirection, streamStatus, closeReason,
	connectorConnectOptions, adapterFactory, reconnectionPolicy, reconnectionOptions,
	reconnection, reconnectionState, reconnectionEvent,
];
type Inventory = [
	IRemoteServiceDescriptor<unknown, never>, IRpcPeer, IRpcConnector,
	IRpcConnectorReconnection, IRpcAcceptor,
	RpcPeerState, RpcConnectorState, RpcAcceptorListenerState,
	RpcAcceptorState, RpcCloseReasonEnum, RpcEventDirectionEnum, RpcEvent, RpcExceptionCodeEnum,
	RpcConnectorOptions, RpcConnectorConnectOptions, RpcAcceptorOptions,
	RpcConnectorRuntimePolicyOptions,
	RpcAcceptorRuntimePolicyOptions, IRpcConnectorAdapter, IRpcAcceptorAdapter,
	IRpcProtocolRuntimePolicy, IRpcApplicationRecord, RpcApplicationValue,
	RpcCallFailure, RpcProtocolFaultReason, RpcSessionCloseReason,
	CreateRpcConnectorReconnectionOptions, RpcConnectorAdapterFactory,
	RpcConnectorReconnectionEvent, RpcConnectorReconnectionPolicyOptions,
	RpcConnectorReconnectionState,
  IRpcApplicationArgumentsSnapshot, IRpcApplicationSnapshot,
  IRpcProtocolAcceptorHost, IRpcProtocolAcceptorRuntime, IRpcProtocolConnectorHost,
  IRpcProtocolConnectorRuntime, IRpcProtocolHost, IRpcProtocolIncomingCall,
  IRpcProtocolIncomingCallRequest, IRpcProtocolIncomingCallReservation,
  IRpcProtocolIncomingHandlerCall, IRpcProtocolInvocation,
  IRpcProtocolInvocationRequest, IRpcProtocolInvocationReservation,
  IRpcProtocolInvocationSink, IRpcProtocolRoleRuntime, IRpcProtocolSession,
  IRpcProtocolSessionHost, IRpcRetainedBytesReservation, RpcCallOutcome,
  RpcHandlerOutcome, RpcIncomingFailure,
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
import type { RemoteService, RpcMemberDefinitions } from "@husky-di/remote";
// @ts-expect-error Concrete implementation classes are private.
import type { RpcConnectorImpl as RootRpcConnectorImpl } from "@husky-di/remote";
// @ts-expect-error Implementation deep imports are private.
import type { RpcConnectorImpl as DeepRpcConnectorImpl } from "@husky-di/remote/dist/impls/rpc-connector.impl.js";
// @ts-expect-error RPC-API-007 removes RpcPeerResult from the installed root.
import type { RpcPeerResult } from "@husky-di/remote";
// @ts-expect-error RPC-API-007 removes RemoteServiceGroup from the installed root.
import type { RemoteServiceGroup } from "@husky-di/remote";
// @ts-expect-error RPC-RELEASE-018 removes RpcCallDirectionEnum from the installed root.
import { RpcCallDirectionEnum } from "@husky-di/remote";
declare const acceptor: IRpcAcceptor;
// @ts-expect-error RPC-API-007 removes resolveAll from the installed IRpcAcceptor.
acceptor.resolveAll;
// @ts-expect-error RPC-RELEASE-018 removes unknownMethod from the exact enum.
RpcExceptionCodeEnum.unknownMethod;
declare const runtimePolicy: IRpcProtocolRuntimePolicy;
// @ts-expect-error RPC-RELEASE-018 removes maxPendingInvocationsPerSession.
runtimePolicy.maxPendingInvocationsPerSession;
`,
		);
		run(process.execPath, [tscPath, "-p", consumerRoot], consumerRoot);
	});

	it("RPC-RELEASE-017 RPC-RELEASE-018 compiles an installed strict NodeNext .cts require consumer", () => {
		const consumerRoot = createConsumer("declarations-cjs", "commonjs");
		writeFileSync(
			resolve(consumerRoot, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					lib: ["ES2023", "DOM", "DOM.Iterable"],
					module: "NodeNext",
					moduleResolution: "NodeNext",
					noEmit: true,
					skipLibCheck: false,
					strict: true,
					types: [],
				},
				include: ["index.cts"],
			}),
		);
		writeFileSync(
			resolve(consumerRoot, "index.cts"),
			`import root = require("@husky-di/remote");
import protocol = require("@husky-di/remote/protocol");
import transport = require("@husky-di/remote/transport");
import conformance = require("@husky-di/remote/conformance");

declare const peer: root.IRpcPeer;
declare const connection: transport.IRpcConnection;
declare const protocolValue: protocol.IRpcProtocol;
declare const report: conformance.RpcConformanceReport;
void [root.createRpcConnector, protocol.createRpcProtocol,
  conformance.runRpcProtocolConformance, peer, connection, protocolValue, report];
// @ts-expect-error RPC-RELEASE-018 removes RpcCallDirectionEnum.
root.RpcCallDirectionEnum;
// @ts-expect-error RPC-RELEASE-018 removes RpcPeerResult.
type RemovedPeerResult = root.RpcPeerResult;
// @ts-expect-error RPC-RELEASE-018 removes RemoteServiceGroup.
type RemovedGroup = root.RemoteServiceGroup;
declare const acceptor: root.IRpcAcceptor;
// @ts-expect-error RPC-RELEASE-018 removes resolveAll.
acceptor.resolveAll;
// @ts-expect-error RPC-RELEASE-018 removes unknownMethod.
root.RpcExceptionCodeEnum.unknownMethod;
declare const policy: root.IRpcProtocolRuntimePolicy;
// @ts-expect-error RPC-RELEASE-018 removes maxPendingInvocationsPerSession.
policy.maxPendingInvocationsPerSession;
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
			`import { createRpcConnector, createRpcConnectorReconnection } from "@husky-di/remote";
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
const connector = createRpcConnector({ protocol });
const reconnection = createRpcConnectorReconnection({
  connector,
  adapterFactory: () => adapter,
});
void [connector, reconnection.connect(), runRpcConnectorAdapterConformance, schema];
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
