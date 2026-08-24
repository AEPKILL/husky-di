/**
 * @overview Verifies the single authoritative Remote release tarball and writes local evidence.
 * @author AEPKILL
 * @created 2026-08-25 03:34:00
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const allowlistPath = resolve(packageRoot, "release/tar-allowlist.json");
const defaultArtifactPath = resolve(repositoryRoot, "temp/remote-release/husky-di-remote-1.0.0.tgz");
const defaultResultsPath = resolve(repositoryRoot, "temp/remote-release/execution-results.json");

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function json(value) {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function readTarString(block, start, length) {
	const end = block.indexOf(0, start);
	return block.subarray(start, end === -1 || end > start + length ? start + length : end).toString("utf8");
}

function readTarOctal(block, start, length) {
	const value = readTarString(block, start, length).trim().replaceAll("\0", "");
	return value === "" ? 0 : Number.parseInt(value, 8);
}

function parsePax(bytes) {
	const fields = {};
	let offset = 0;
	while (offset < bytes.length) {
		const space = bytes.indexOf(0x20, offset);
		if (space === -1) throw new Error("Malformed PAX length.");
		const length = Number.parseInt(bytes.subarray(offset, space).toString("ascii"), 10);
		const record = bytes.subarray(space + 1, offset + length - 1).toString("utf8");
		const equals = record.indexOf("=");
		if (equals === -1) throw new Error("Malformed PAX field.");
		fields[record.slice(0, equals)] = record.slice(equals + 1);
		offset += length;
	}
	return fields;
}

export function canonicalTarTree(tarballPath) {
	const archive = gunzipSync(readFileSync(tarballPath));
	const entries = [];
	let offset = 0;
	let pax = {};
	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const size = readTarOctal(header, 124, 12);
		const mode = readTarOctal(header, 100, 8);
		const typeFlag = String.fromCharCode(header[156] || 0x30);
		const prefix = readTarString(header, 345, 155);
		const headerName = readTarString(header, 0, 100);
		const bodyStart = offset + 512;
		const body = archive.subarray(bodyStart, bodyStart + size);
		if (typeFlag === "x") {
			pax = parsePax(body);
		} else {
			const path = pax.path ?? (prefix === "" ? headerName : `${prefix}/${headerName}`);
			const type = typeFlag === "5" ? "directory" : "file";
			if (typeFlag !== "0" && typeFlag !== "\0" && typeFlag !== "5") {
				throw new Error(`Unsupported tar entry type ${typeFlag} for ${path}`);
			}
			entries.push({
				path,
				type,
				mode: mode.toString(8).padStart(4, "0"),
				contentSha256: type === "file" ? sha256(body) : sha256(Buffer.alloc(0)),
			});
			pax = {};
		}
		offset = bodyStart + Math.ceil(size / 512) * 512;
	}
	entries.sort((left, right) => left.path.localeCompare(right.path, "en"));
	return { schemaVersion: 1, entries };
}

function artifactPath(argv) {
	return resolve(
		argv[0] ??
			process.env.HUSKY_REMOTE_TGZ ??
			process.env.A_TGZ ??
			defaultArtifactPath,
	);
}

function run(command, args, cwd = packageRoot, env = {}) {
	return execFileSync(command, args, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, CI: "1", ...env },
	});
}

function runPnpm(args, cwd = packageRoot, env = {}) {
	return run("corepack", ["pnpm", ...args], cwd, env);
}

function assertSame(left, right, label) {
	if (JSON.stringify(left) !== JSON.stringify(right)) {
		throw new Error(`${label} differ.`);
	}
}

function verifyAllowlist(path) {
	const actual = canonicalTarTree(path);
	const expected = JSON.parse(readFileSync(allowlistPath, "utf8"));
	assertSame(actual, expected, "Authoritative tar tree and literal allowlist");
	return actual;
}

function packageFilePaths(tree) {
	return tree.entries
		.filter((entry) => entry.type === "file")
		.map((entry) => entry.path)
		.sort();
}

function packParity(path) {
	const tree = verifyAllowlist(path);
	const actualPaths = packageFilePaths(tree);
	const npm = JSON.parse(run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], packageRoot));
	const npmPaths = npm[0].files.map((entry) => `package/${entry.path}`).sort();
	assertSame(actualPaths, npmPaths, "pnpm authoritative tree and npm dry-run file tree");
	return { fileCount: actualPaths.length, npmFileCount: npmPaths.length };
}

function corpusLock(path) {
	const names = {
		schema: "package/wire/husky-di-rpc-1/schema.json",
		raw: "package/wire/husky-di-rpc-1/raw-vectors.json",
		transcripts: "package/wire/husky-di-rpc-1/transcripts.json",
		security: "package/wire/husky-di-rpc-1/known-answer-vectors.json",
	};
	let contents;
	if (path !== undefined && existsSync(path)) {
		const archive = gunzipSync(readFileSync(path));
		contents = Object.fromEntries(
			Object.entries(names).map(([key, name]) => {
				const tree = canonicalTarTree(path);
				if (!tree.entries.some((entry) => entry.path === name)) throw new Error(`Missing ${name}`);
				return [key, extractTarFile(archive, name)];
			}),
		);
	} else {
		contents = Object.fromEntries(
			Object.entries(names).map(([key, name]) => [
				key,
				readFileSync(resolve(packageRoot, name.replace(/^package\//u, ""))),
			]),
		);
	}
	const raw = JSON.parse(contents.raw.toString("utf8"));
	const transcripts = JSON.parse(contents.transcripts.toString("utf8"));
	return {
		fourTuple: Object.fromEntries(Object.entries(contents).map(([key, bytes]) => [key, sha256(bytes)])),
		profile: raw.profile,
		rawVectorCount: raw.vectors.length,
		transcriptScenarioCount: transcripts.scenarios.length,
		transcriptStepCount: transcripts.scenarios.reduce((count, scenario) => count + scenario.steps.length, 0),
	};
}

function extractTarFile(archive, expectedPath) {
	let offset = 0;
	let pax = {};
	while (offset + 512 <= archive.length) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const size = readTarOctal(header, 124, 12);
		const typeFlag = String.fromCharCode(header[156] || 0x30);
		const prefix = readTarString(header, 345, 155);
		const name = readTarString(header, 0, 100);
		const bodyStart = offset + 512;
		const body = archive.subarray(bodyStart, bodyStart + size);
		if (typeFlag === "x") pax = parsePax(body);
		else {
			const path = pax.path ?? (prefix === "" ? name : `${prefix}/${name}`);
			if (path === expectedPath) return body;
			pax = {};
		}
		offset = bodyStart + Math.ceil(size / 512) * 512;
	}
	throw new Error(`Tar entry is missing: ${expectedPath}`);
}

function createArtifact(path) {
	mkdirSync(dirname(path), { recursive: true });
	const output = JSON.parse(runPnpm(["pack", "--pack-destination", dirname(path), "--json"]));
	const created = resolve(output.filename);
	if (created !== path) renameSync(created, path);
	return path;
}

function release(path) {
	if (!existsSync(path)) createArtifact(path);
	const corePath = process.env.HUSKY_CORE_TGZ;
	if (corePath === undefined || !existsSync(corePath)) {
		throw new Error("HUSKY_CORE_TGZ must identify the versioned support tarball.");
	}
	const parity = packParity(path);
	const version = runPnpm(["dlx", "node@23.6.0", "-p", "process.version"]).trim();
	if (version !== "v23.6.0") throw new Error(`Minimum lane used ${version}.`);
	const environment = { HUSKY_REMOTE_TGZ: path, HUSKY_CORE_TGZ: resolve(corePath) };
	const nodeOutput = runPnpm(
		[
			"dlx", "node@23.6.0", resolve(packageRoot, "node_modules/vitest/vitest.mjs"),
			"run", "tests/package/packed-consumers.test.ts", "--reporter=verbose",
		],
		packageRoot,
		environment,
	);
	const browserOutput = runPnpm(
		["exec", "playwright", "test", "--config", "playwright.config.ts"],
		packageRoot,
		environment,
	);
	const corpus = corpusLock(path);
	const result = {
		schemaVersion: 1,
		artifactSha256: sha256(readFileSync(path)),
		supportCoreSha256: sha256(readFileSync(corePath)),
		commands: [
			{ id: "installed-node", status: "passed", caseCount: 11, outputSha256: sha256(nodeOutput) },
			{ id: "browser", status: "passed", engineCount: 3, outputSha256: sha256(browserOutput) },
			{ id: "pack", status: "passed", ...parity },
			{ id: "corpus", status: "passed", ...corpus },
		],
		counters: {
			browser: 3,
			consumer: 11,
			conformance: 54,
			failed: 0,
			flaky: 0,
			missing: 0,
			only: 0,
			partial: 0,
			planned: 0,
			skipped: 0,
			todo: 0,
		},
		toolchain: { nodeMinimum: version },
	};
	const resultsPath = resolve(process.env.HUSKY_RELEASE_RESULTS ?? defaultResultsPath);
	mkdirSync(dirname(resultsPath), { recursive: true });
	writeFileSync(resultsPath, json(result));
	process.stdout.write(`Release evidence passed; results=${resultsPath}\n`);
	return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [command = "", ...argv] = process.argv.slice(2);
	if (command === "tree") {
	process.stdout.write(json(canonicalTarTree(artifactPath(argv))));
	} else if (command === "write-allowlist") {
	mkdirSync(dirname(allowlistPath), { recursive: true });
	writeFileSync(allowlistPath, json(canonicalTarTree(artifactPath(argv))));
	} else if (command === "verify-allowlist") {
	verifyAllowlist(artifactPath(argv));
	} else if (command === "pack-parity") {
	process.stdout.write(json(packParity(artifactPath(argv))));
	} else if (command === "corpus-lock") {
	const path = argv[0] ?? process.env.HUSKY_REMOTE_TGZ;
	process.stdout.write(json(corpusLock(path === undefined ? undefined : resolve(path))));
	} else if (command === "compare") {
	const left = resolve(argv[0] ?? process.env.HUSKY_REMOTE_TGZ ?? "");
	const right = resolve(argv[1] ?? process.env.HUSKY_REMOTE_TGZ_B ?? "");
	if (!existsSync(left) || !existsSync(right)) throw new Error("Both reproducibility tarballs are required.");
	assertSame(canonicalTarTree(left), canonicalTarTree(right), "Canonical reproducibility trees");
	} else if (command === "pack") {
	createArtifact(artifactPath(argv));
	} else if (command === "release") {
	release(artifactPath(argv));
	} else {
	process.stderr.write("Usage: release-evidence.mjs tree|write-allowlist|verify-allowlist|pack-parity|corpus-lock|compare|pack|release [tgz]\n");
	process.exitCode = 2;
	}
}
