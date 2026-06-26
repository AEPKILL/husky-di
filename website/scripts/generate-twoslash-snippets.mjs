/**
 * @overview Generate static Shiki + Twoslash HTML snippets for the Husky DI
 * website so code blocks get syntax highlighting and hover type information
 * without shipping the TypeScript compiler to the browser.
 * @author Codex
 * @created 2026-06-26 00:05:00
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { rendererRich, transformerTwoslash } from "@shikijs/twoslash";
import { codeToHtml } from "shiki";

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteRootPath = join(__dirname, "..");
const twoslashSourcesPath = join(
	websiteRootPath,
	"src/constants/twoslash-sources.json",
);
const outputPath = join(
	websiteRootPath,
	"src/constants/twoslash-snippets.const.ts",
);

async function renderTwoslashSnippets() {
	const twoslashSourceText = await readFile(twoslashSourcesPath, "utf8");
	const twoslashSources = JSON.parse(twoslashSourceText);
	const twoslashEntries = await Promise.all(
		Object.entries(twoslashSources).map(async ([snippetId, snippetCode]) => {
			const snippetHtml = await codeToHtml(snippetCode, {
				lang: "ts",
				theme: "github-dark-default",
				transformers: [
					transformerTwoslash({
						renderer: rendererRich(),
					}),
				],
			});

			return [snippetId, snippetHtml];
		}),
	);

	const outputFileText = `/**
 * @overview Generated static Twoslash HTML snippets for the Husky DI website.
 * @author Codex
 * @created 2026-06-26 00:05:00
 */

export const TWOSLASH_SNIPPETS_HTML_BY_ID = ${JSON.stringify(
		Object.fromEntries(twoslashEntries),
		null,
		2,
	)} as const;

export type TwoslashSnippetId = keyof typeof TWOSLASH_SNIPPETS_HTML_BY_ID;
`;

	await writeFile(outputPath, outputFileText);
}

await renderTwoslashSnippets();
