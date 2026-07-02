/**
 * @overview Call-to-action section for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { HOME_PAGE_INSTALL_COMMAND } from "../consts/homepage.const";

export function HomepageCtaSection() {
	const { copyText, isCopied } = useCopyFeedback();

	const handleCopy = async () => {
		await copyText(HOME_PAGE_INSTALL_COMMAND.command);
	};

	return (
		<section className="border-t border-border bg-surface-panel py-10 text-center">
			<div className="mx-auto max-w-300 px-6">
				<h2 className="mb-4 font-sans text-[32px] font-semibold leading-10 tracking-[-0.01em] text-page-fg">
					Ready for Production?
				</h2>
				<p className="mx-auto mb-6 max-w-lg text-base leading-6 text-page-muted">
					Husky DI is built for developers who want explicit architecture,
					deterministic runtime rules, and a container that stays easy to debug
					as the graph grows.
				</p>

				<div className="flex justify-center">
					<button
						className="bg-accent px-10 py-4 font-mono text-sm font-bold uppercase text-accent-contrast transition-all hover:opacity-90 active:scale-95"
						onClick={handleCopy}
						type="button"
					>
						{isCopied
							? "Copied npm install command"
							: HOME_PAGE_INSTALL_COMMAND.command}
					</button>
				</div>
			</div>
		</section>
	);
}
