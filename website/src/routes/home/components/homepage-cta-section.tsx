/**
 * @overview Call-to-action section for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { useState } from "react";
import { HOME_PAGE_INSTALL_COMMAND } from "../consts/homepage.const";

const COPY_FEEDBACK_HIDE_DELAY_MS = 1600;

export function HomepageCtaSection() {
	const [isCopied, setIsCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(HOME_PAGE_INSTALL_COMMAND.command);
			setIsCopied(true);
			window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_HIDE_DELAY_MS);
		} catch {
			setIsCopied(false);
		}
	};

	return (
		<section className="border-t border-[#3b4a3d] bg-[#191c20] py-10 text-center">
			<div className="mx-auto max-w-[1200px] px-6">
				<h2 className="mb-4 font-sans text-[32px] font-semibold leading-10 tracking-[-0.01em] text-[#e0e2e7]">
					Ready for Production?
				</h2>
				<p className="mx-auto mb-6 max-w-lg text-base leading-6 text-[#bacbb9]">
					Husky DI is built for developers who want explicit architecture,
					deterministic runtime rules, and a container that stays easy to debug
					as the graph grows.
				</p>

				<div className="flex justify-center">
					<button
						className="bg-[#75ff9e] px-10 py-4 font-mono text-sm font-bold uppercase text-[#101417] transition-all hover:opacity-90 active:scale-95"
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
