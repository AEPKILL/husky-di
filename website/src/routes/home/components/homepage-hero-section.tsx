/**
 * @overview Hero section for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import {
	HOME_PAGE_HERO_BADGE_LABEL,
	HOME_PAGE_HERO_DESCRIPTION,
	HOME_PAGE_HERO_PRIMARY_ACTION,
	HOME_PAGE_HERO_SECONDARY_ACTION,
	HOME_PAGE_HERO_TITLE_LINES,
} from "../consts/homepage.const";
import styles from "../styles/homepage.module.css";
import { HomepageHeroCoin3d } from "./homepage-hero-coin-3d";
import { HomepageMaterialSymbol } from "./homepage-material-symbol";

export function HomepageHeroSection() {
	return (
		<section
			className={`${styles.heroSection} relative flex min-h-[100svh] items-center overflow-hidden border-b border-[#3b4a3d]`}
		>
			<div className="relative z-10 mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-10 px-6 py-16 md:grid-cols-2 md:gap-10 md:py-20">
				<div className="flex flex-col gap-6">
					<div className="inline-flex w-fit items-center gap-1 rounded bg-[#75ff9e]/10 px-2 py-1 font-mono text-xs uppercase tracking-[0.1em] text-[#75ff9e]">
						<HomepageMaterialSymbol className="text-sm" name="shield" />
						<span>{HOME_PAGE_HERO_BADGE_LABEL}</span>
					</div>

					<h1 className="font-sans text-[48px] font-bold leading-[56px] tracking-[-0.02em] text-[#e0e2e7]">
						{HOME_PAGE_HERO_TITLE_LINES[0]}
						<br />
						<span className="text-[#75ff9e]">
							{HOME_PAGE_HERO_TITLE_LINES[1]}
						</span>
					</h1>

					<p className="max-w-lg text-base leading-6 text-[#bacbb9]">
						{HOME_PAGE_HERO_DESCRIPTION}
					</p>

					<div className="mt-4 flex flex-wrap gap-4">
						<a
							className="bg-[#75ff9e] px-6 py-2 font-mono text-sm font-bold uppercase tracking-tight text-[#101417] transition-all hover:opacity-90 active:scale-95"
							href={HOME_PAGE_HERO_PRIMARY_ACTION.href}
							rel="noreferrer"
							target="_blank"
						>
							{HOME_PAGE_HERO_PRIMARY_ACTION.label}
						</a>
						<a
							className="border border-[#3b4a3d] px-6 py-2 font-mono text-sm font-bold uppercase tracking-tight text-[#e0e2e7] transition-all hover:bg-[#323539]"
							href={HOME_PAGE_HERO_SECONDARY_ACTION.href}
							rel="noreferrer"
							target="_blank"
						>
							{HOME_PAGE_HERO_SECONDARY_ACTION.label}
						</a>
					</div>
				</div>

				<div
					className={`${styles.heroVisual} flex items-center justify-center`}
				>
					<HomepageHeroCoin3d />
				</div>
			</div>

			<a
				aria-label="Scroll to dependency injection workflow"
				className={`${styles.scrollIndicator} absolute bottom-6 left-1/2 z-10 -translate-x-1/2`}
				href="#homepage-workflow"
			>
				<span aria-hidden="true" className={styles.scrollIndicatorMouse}>
					<span className={styles.scrollIndicatorDot} />
				</span>
				<span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#75ff9e]/80">
					Scroll
				</span>
				<HomepageMaterialSymbol
					className={`${styles.scrollIndicatorChevron} text-base text-[#75ff9e]`}
					name="keyboard_arrow_down"
				/>
			</a>
		</section>
	);
}
