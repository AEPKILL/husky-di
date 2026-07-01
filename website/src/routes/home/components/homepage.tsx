/**
 * @overview Homepage component for the Husky DI website.
 * @author AEPKILL
 * @created 2026-06-30 12:35:00
 */

import { DiWorkflowAnimation } from "@/components/di-workflow-animation";
import { HomepageCodeExampleSection } from "./homepage-code-example-section";
import { HomepageCtaSection } from "./homepage-cta-section";
import { HomepageDependencyGraphSection } from "./homepage-dependency-graph-section";
import { HomepageFooter } from "./homepage-footer";
import { HomepageHeroSection } from "./homepage-hero-section";

export function Homepage() {
	return (
		<div className="bg-[#101417] text-[#e0e2e7]">
			<main>
				<HomepageHeroSection />
				<div id="homepage-workflow">
					<DiWorkflowAnimation className="border-b border-[#3b4a3d]" />
				</div>
				<HomepageDependencyGraphSection />
				<HomepageCodeExampleSection />
				<HomepageCtaSection />
			</main>
			<HomepageFooter />
		</div>
	);
}
