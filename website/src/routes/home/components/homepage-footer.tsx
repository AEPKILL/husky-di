/**
 * @overview Footer for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import {
	HOME_PAGE_FOOTER_COPYRIGHT,
	HOME_PAGE_FOOTER_NAV_ITEMS,
	HOME_PAGE_FOOTER_STATUS_LABEL,
	HOME_PAGE_FOOTER_TAGLINE,
} from "../consts/homepage.const";

export function HomepageFooter() {
	return (
		<footer className="border-t border-[#3b4a3d] bg-[#0b0f12]">
			<div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-between gap-4 px-6 py-6 md:flex-row">
				<div className="flex flex-col items-center gap-1 md:items-start">
					<span className="font-mono text-xs text-[#bacbb9]">
						{HOME_PAGE_FOOTER_COPYRIGHT}
					</span>
					<span className="font-mono text-xs uppercase tracking-[0.1em] text-[#75ff9e]">
						{HOME_PAGE_FOOTER_TAGLINE}
					</span>
				</div>

				<div className="flex flex-wrap items-center justify-center gap-6">
					{HOME_PAGE_FOOTER_NAV_ITEMS.map((item) =>
						"href" in item && item.href ? (
							<a
								className="font-mono text-xs uppercase tracking-[0.1em] text-[#bacbb9] transition-colors hover:text-[#e0e2e7]"
								href={item.href}
								key={item.label}
								rel="noreferrer"
								target="_blank"
							>
								{item.label}
							</a>
						) : (
							<span
								className="font-mono text-xs uppercase tracking-[0.1em] text-[#bacbb9]"
								key={item.label}
							>
								{item.label}
							</span>
						),
					)}

					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-[#75ff9e]" />
						<span className="font-mono text-xs uppercase tracking-[0.1em] text-[#75ff9e]">
							{HOME_PAGE_FOOTER_STATUS_LABEL}
						</span>
					</div>
				</div>
			</div>
		</footer>
	);
}
