/**
 * @overview Dependency graph showcase section for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import {
	HOME_PAGE_DEPENDENCY_GRAPH_BULLETS,
	HOME_PAGE_DEPENDENCY_GRAPH_DESCRIPTION,
	HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_ALT,
	HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_URL,
	HOME_PAGE_DEPENDENCY_GRAPH_TITLE,
} from "../consts/homepage.const";
import { HomepageMaterialSymbol } from "./homepage-material-symbol";

export function HomepageDependencyGraphSection() {
	return (
		<section className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-6 py-10 md:grid-cols-12">
			<div className="flex flex-col gap-4 md:col-span-5">
				<h2 className="font-sans text-[32px] font-semibold leading-10 tracking-[-0.01em] text-page-fg">
					{HOME_PAGE_DEPENDENCY_GRAPH_TITLE}
				</h2>
				<p className="text-base leading-6 text-page-muted">
					{HOME_PAGE_DEPENDENCY_GRAPH_DESCRIPTION}
				</p>

				<ul className="mt-2 flex flex-col gap-2">
					{HOME_PAGE_DEPENDENCY_GRAPH_BULLETS.map((bullet) => (
						<li
							className="flex items-center gap-2 font-mono text-xs text-page-fg"
							key={bullet}
						>
							<HomepageMaterialSymbol
								className="text-base text-accent"
								name="check_circle"
							/>
							<span>{bullet}</span>
						</li>
					))}
				</ul>
			</div>

			<div className="md:col-span-7">
				<div className="group relative">
					<div className="absolute -inset-1 bg-accent-soft-strong opacity-25 blur transition duration-1000 group-hover:opacity-40" />
					<img
						alt={HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_ALT}
						className="relative w-full rounded-lg border border-border grayscale shadow-2xl transition-all duration-500 group-hover:grayscale-0"
						loading="lazy"
						src={HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_URL}
					/>
				</div>
			</div>
		</section>
	);
}
