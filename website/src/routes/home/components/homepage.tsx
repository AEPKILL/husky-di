/**
 * @overview Homepage component for the Husky DI website.
 * @author AEPKILL
 * @created 2026-06-30 12:35:00
 */

import { DiWorkflowAnimation } from "@/components/di-workflow-animation";
import { HomepageCtaSection } from "./homepage-cta-section";
import { HomepageFooter } from "./homepage-footer";
import { HomepageHeroSection } from "./homepage-hero-section";
import { HomepageTutorialSection } from "./homepage-tutorial-section";

export function Homepage() {
	return (
		<div className="bg-page-bg text-page-fg">
			<main>
				<HomepageHeroSection />
				<div id="homepage-workflow">
					<DiWorkflowAnimation className="border-b border-border" />
				</div>
				<HomepageTutorialSection />
				<HomepageCtaSection />
			</main>
			<HomepageFooter />
		</div>
	);
}
