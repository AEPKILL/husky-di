/**
 * @overview Top navigation bar for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import {
	HOME_PAGE_LINKS,
	HOME_PAGE_VERSION_LABEL,
} from "../consts/homepage.const";
import { HomepageMaterialSymbol } from "./homepage-material-symbol";

export function HomepageTopNav() {
	return (
		<header className="sticky top-0 z-50 border-b border-[#3b4a3d] bg-[#101417]">
			<div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-2">
				<div className="flex items-center gap-4">
					<span className="font-sans text-[32px] font-bold tracking-[-0.01em] text-[#e0e2e7]">
						Husky DI
					</span>

					<nav className="ml-10 hidden gap-6 md:flex">
						<a
							className="border-b-2 border-[#75ff9e] pb-1 font-mono text-sm text-[#75ff9e] transition-colors duration-200"
							href={HOME_PAGE_LINKS.documentation}
							rel="noreferrer"
							target="_blank"
						>
							Documentation
						</a>
						<a
							className="font-mono text-sm text-[#bacbb9] transition-colors duration-200 hover:text-[#75ff9e]"
							href={HOME_PAGE_LINKS.github}
							rel="noreferrer"
							target="_blank"
						>
							GitHub
						</a>
					</nav>
				</div>

				<div className="flex items-center gap-4">
					<span className="font-mono text-sm text-[#bacbb9]">
						{HOME_PAGE_VERSION_LABEL}
					</span>
					<HomepageMaterialSymbol className="text-[#75ff9e]" name="terminal" />
				</div>
			</div>
		</header>
	);
}
