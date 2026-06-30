/**
 * @overview Feature grid section for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { HOME_PAGE_FEATURE_GRID_ITEMS } from "../consts/homepage.const";
import { HomepageMaterialSymbol } from "./homepage-material-symbol";

export function HomepageFeatureGridSection() {
	return (
		<section className="border-b border-[#3b4a3d] bg-[#0b0f12] py-10">
			<div className="mx-auto max-w-[1200px] px-6">
				<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
					{HOME_PAGE_FEATURE_GRID_ITEMS.map((item) => (
						<div
							className="flex flex-col gap-2 border border-[#3b4a3d] bg-[#1d2024] p-6"
							key={item.title}
						>
							<HomepageMaterialSymbol
								className="mb-2 text-[#75ff9e]"
								name={item.icon}
							/>
							<h3 className="font-mono text-sm font-bold uppercase tracking-tight text-[#e0e2e7]">
								{item.title}
							</h3>
							<p className="text-sm leading-5 text-[#bacbb9]">
								{item.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
