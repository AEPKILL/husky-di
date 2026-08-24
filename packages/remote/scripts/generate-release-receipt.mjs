/**
 * @overview Writes the canonical local release receipt for the authoritative Remote tarball.
 * @author AEPKILL
 * @created 2026-08-25 03:39:00
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "@playwright/test";

import { canonicalTarTree } from "./release-evidence.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const evidenceRoot = resolve(packageRoot, "evidence");
const artifactPath = resolve(
	process.env.HUSKY_REMOTE_TGZ ??
		process.env.A_TGZ ??
		resolve(repositoryRoot, "temp/remote-release/husky-di-remote-1.0.0.tgz"),
);
const resultsPath = resolve(
	process.env.HUSKY_RELEASE_RESULTS ?? resolve(evidenceRoot, "execution-results.json"),
);
const receiptPath = resolve(
	process.env.HUSKY_RELEASE_RECEIPT ?? resolve(evidenceRoot, "release-receipt.jcs.json"),
);

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function git(...args) {
	return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function canonicalize(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
	if (typeof value === "object" && value !== null) {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

async function browserVersions() {
	const versions = {};
	for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
		const browser = await browserType.launch({ headless: true });
		try {
			versions[name] = browser.version();
		} finally {
			await browser.close();
		}
	}
	return versions;
}

if (!existsSync(artifactPath)) throw new Error(`Authoritative A tgz is missing: ${artifactPath}`);
if (!existsSync(resultsPath)) throw new Error(`Execution results are missing: ${resultsPath}`);

const artifactBytes = readFileSync(artifactPath);
const artifactSha256 = sha256(artifactBytes);
const results = readJson(resultsPath);
if (results.artifactSha256 !== artifactSha256) throw new Error("Execution results identify a different artifact.");

const registries = Object.fromEntries(
	["requirements", "cases", "evidence", "matrix"].map((name) => {
		const path = resolve(evidenceRoot, `${name}.json`);
		return [name, { content: readJson(path), sha256: sha256(readFileSync(path)) }];
	}),
);
const wireRoot = resolve(packageRoot, "wire/husky-di-rpc-1");
const corpusPaths = {
	schema: resolve(wireRoot, "schema.json"),
	raw: resolve(wireRoot, "raw-vectors.json"),
	transcripts: resolve(wireRoot, "transcripts.json"),
	security: resolve(wireRoot, "known-answer-vectors.json"),
};
const security = readJson(corpusPaths.security);
const schema = readJson(corpusPaths.schema);
const metaschemaPath = resolve(
	packageRoot,
	"node_modules/ajv/dist/refs/json-schema-2020-12/schema.json",
);
const validatorPath = resolve(packageRoot, "tests/wire/protocol-corpus.test.ts");
const oraclePath = resolve(packageRoot, "scripts/generate-rpc-wire-corpus.mjs");
const workflowPath = resolve(repositoryRoot, ".github/workflows/release.yml");
const workflow = readFileSync(workflowPath, "utf8");
const publishCommand = 'npm publish "$A_TGZ" --access public';
if (!workflow.includes(publishCommand)) throw new Error("Workflow does not publish the tested A_TGZ input.");

const receipt = {
	schemaVersion: 1,
	package: { name: "@husky-di/remote", version: "1.0.0" },
	source: {
		commit: git("rev-parse", "HEAD"),
		tree: git("rev-parse", "HEAD^{tree}"),
		lockfileSha256: sha256(readFileSync(resolve(repositoryRoot, "pnpm-lock.yaml"))),
	},
	toolchain: {
		nodeMinimum: "v23.6.0",
		nodeReceipt: process.version,
		pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
		typescript: readJson(resolve(packageRoot, "node_modules/typescript/package.json")).version,
		playwright: readJson(resolve(packageRoot, "node_modules/@playwright/test/package.json")).version,
		browserEngines: await browserVersions(),
	},
	artifact: {
		authoritativeTgzSha256: artifactSha256,
		testedTgzSha256: artifactSha256,
		publishedTgzSha256: artifactSha256,
		published: false,
		publishedDigestMeaning: "workflow publish-input binding only; no registry publication was performed",
		canonicalTree: canonicalTarTree(artifactPath).entries,
	},
	workflow: {
		path: ".github/workflows/release.yml",
		sha256: sha256(readFileSync(workflowPath)),
		publishCommand,
		publishInputSha256: artifactSha256,
		publishInputEqualsAuthoritative: true,
	},
	corpus: {
		profile: "husky-di-rpc/1",
		fourTuple: Object.fromEntries(
			Object.entries(corpusPaths).map(([name, path]) => [name, sha256(readFileSync(path))]),
		),
		jcs: {
			source: security.sources.jcs,
			vectorsSha256: sha256(Buffer.from(canonicalize(security.jcs))),
		},
		metaschema: {
			id: schema.$schema,
			sha256: sha256(readFileSync(metaschemaPath)),
		},
		oracle: {
			generatorSha256: sha256(readFileSync(oraclePath)),
			knownAnswerSha256: sha256(readFileSync(corpusPaths.security)),
			provenanceSha256: sha256(Buffer.from(canonicalize(security.provenance))),
		},
		productionRunnerSha256: sha256(readFileSync(validatorPath)),
	},
	registries: {
		requirementsSha256: registries.requirements.sha256,
		casesSha256: registries.cases.sha256,
		evidenceSha256: registries.evidence.sha256,
		matrixSha256: registries.matrix.sha256,
		requirements: registries.requirements.content,
		cases: registries.cases.content,
		evidence: registries.evidence.content,
		matrix: registries.matrix.content,
	},
	results,
	validator: {
		path: "tests/wire/protocol-corpus.test.ts",
		sha256: sha256(readFileSync(validatorPath)),
	},
};

writeFileSync(receiptPath, `${canonicalize(receipt)}\n`);
process.stdout.write(`${receiptPath}\n`);
