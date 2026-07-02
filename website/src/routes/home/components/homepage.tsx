/**
 * @overview Homepage component for the Husky DI website.
 * @author AEPKILL
 * @created 2026-06-30 12:35:00
 */

import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";
import { HomepageCtaSection } from "./homepage-cta-section";
import { HomepageFooter } from "./homepage-footer";
import { HomepageHeroSection } from "./homepage-hero-section";
import { HomepageTutorialSection } from "./homepage-tutorial-section";

export type HomepageProps = Readonly<{
	tutorialSteps: readonly CodehikeScrollyDemoStep[];
}>;

export function Homepage({ tutorialSteps }: HomepageProps) {
	return (
		<div className="bg-page-bg text-page-fg">
			<main>
				<HomepageHeroSection />
				<HomepageTutorialSection steps={tutorialSteps} />
				<HomepageCtaSection />
			</main>
			<HomepageFooter />
		</div>
	);
}
