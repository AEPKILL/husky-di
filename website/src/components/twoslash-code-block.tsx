/**
 * @overview Static code block component powered by generated Twoslash HTML.
 * @author Codex
 * @created 2026-06-26 00:05:00
 */

import type { TwoslashSnippetId } from "@/constants/twoslash-snippets.const";
import { TWOSLASH_SNIPPETS_HTML_BY_ID } from "@/constants/twoslash-snippets.const";
import { cn } from "@/utils/class-name.utils";

interface ITwoslashCodeBlockProps {
	className?: string;
	snippetId: TwoslashSnippetId;
}

export function TwoslashCodeBlock(props: Readonly<ITwoslashCodeBlockProps>) {
	return (
		<div
			className={cn(
				"twoslash-code-block overflow-x-auto rounded-xl border border-[var(--surface-stroke)] bg-[var(--bg-2)] p-4 text-sm leading-6",
				props.className,
			)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Twoslash HTML is generated locally at build time from checked-in source snippets.
			dangerouslySetInnerHTML={{
				__html: TWOSLASH_SNIPPETS_HTML_BY_ID[props.snippetId],
			}}
		/>
	);
}
