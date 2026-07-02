/**
 * @overview Feature grid section for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { HOME_PAGE_FEATURE_GRID_ITEMS } from "../consts/homepage.const";
import { HomepageMaterialSymbol } from "./homepage-material-symbol";

export function HomepageFeatureGridSection() {
	return (
		<section className="border-b border-border bg-surface-deep py-10">
			<div className="mx-auto max-w-[1200px] px-6">
				<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
					{HOME_PAGE_FEATURE_GRID_ITEMS.map((item) => (
						<div
							className="flex flex-col gap-2 border border-border bg-surface-panel p-6"
							key={item.title}
						>
							<HomepageMaterialSymbol
								className="mb-2 text-accent"
								name={item.icon}
							/>
							<h3 className="font-mono text-sm font-bold uppercase tracking-tight text-page-fg">
								{item.title}
							</h3>
							<p className="text-sm leading-5 text-page-muted">
								{item.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
