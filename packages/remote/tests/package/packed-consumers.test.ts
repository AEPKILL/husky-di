/**
 * @overview Verifies packed consumers.
 * @author AEPKILL
 * @created 2026-08-19 09:27:48
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { domConsumer, strictDeclarations } from "./consumers/test.utils";
import {
	createConsumer,
	esbuildPath,
	fixtureRoot,
	listFiles,
	nodeRuntimeExportAssertions,
	nodeStreamAssertions,
	packageRoot,
	run,
	runPnpm,
	tarballPaths,
	tscPath,
} from "./test.utils";

beforeAll(() => {
	for (const name of ["core", "remote"]) {
		const workspace = resolve(packageRoot, "..", name);
		const destination = resolve(fixtureRoot, "archives", name);
		mkdirSync(destination, { recursive: true });
		runPnpm(["pack", "--pack-destination", destination, "--json"], workspace);
		const tarballName = readdirSync(destination).find((entry) =>
			entry.endsWith(".tgz"),
		);
		if (tarballName === undefined)
			throw new Error(`pnpm pack did not create a ${name} tarball.`);
		tarballPaths.set(name, resolve(destination, tarballName));
	}
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
		]);
		expect(readdirSync(installedRoot).sort()).toEqual([
			"CHANGELOG.md",
			"LICENSE",
			"README.md",
			"dist",
			"docs",
			"package.json",
		]);
		expect(readdirSync(resolve(installedRoot, "docs")).sort()).toEqual([
			"PROTOCOL.md",
			"REQUIREMENTS.md",
			"SPECIFICATION.md",
			"TRANSPORT.md",
		]);
		expect(listFiles(installedRoot)).not.toEqual(
			expect.arrayContaining(["src/index.ts", "tests/specification.test.ts"]),
		);
		const artifactFiles = listFiles(installedRoot);
		expect(artifactFiles).toEqual(
			expect.arrayContaining([
				"dist/index.cjs.map",
				"dist/modules/owner/impls/rpc-acceptor.impl.js.map",
				"dist/modules/owner/impls/rpc-connector.impl.js.map",
				"dist/modules/peer/impls/rpc-peer.impl.js.map",
			]),
		);
		for (const entry of artifactFiles.filter((path) =>
			path.endsWith(".js.map"),
		)) {
			expect(artifactFiles, `${entry} target`).toContain(entry.slice(0, -4));
		}
	}, 30_000);

	it("RPC-SEC-001 RPC-TRANSPORT-012 packages the initiator authentication and admission boundary", () => {
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
		expect(documentation).toContain("Structural Adapter conformance");
		expect(documentation).toContain("confidentiality");
		expect(documentation).toContain("authentication of the expected responder");
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
import * as core from "@husky-di/core";
import * as rxjs from "rxjs";

${nodeRuntimeExportAssertions}
${nodeStreamAssertions}
for (const subpath of ["schema", "vectors", "transcripts", "security-vectors"]) {
  await assert.rejects(
    import("@husky-di/remote/wire/husky-di-rpc-1/" + subpath, { with: { type: "json" } }),
    (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
}
await assert.rejects(
  import("@husky-di/remote/dist/modules/owner/impls/rpc-connector.impl.js"),
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
const core = require("@husky-di/core");
const rxjs = require("rxjs");

${nodeRuntimeExportAssertions}
${nodeStreamAssertions}
for (const subpath of ["schema", "vectors", "transcripts", "security-vectors"]) {
  assert.throws(
    () => require("@husky-di/remote/wire/husky-di-rpc-1/" + subpath),
    (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
}
assert.throws(
  () => require("@husky-di/remote/dist/modules/owner/impls/rpc-connector.impl.cjs"),
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
		writeFileSync(resolve(consumerRoot, "index.ts"), strictDeclarations);
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
		writeFileSync(entryPath, domConsumer);
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
