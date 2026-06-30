/**
 * @overview Homepage component for the Husky DI website.
 * @author AEPKILL
 * @created 2026-06-30 12:35:00
 */

import { HomepageCodeExampleSection } from "./homepage-code-example-section";
import { HomepageCtaSection } from "./homepage-cta-section";
import { HomepageDependencyGraphSection } from "./homepage-dependency-graph-section";
import { HomepageFeatureGridSection } from "./homepage-feature-grid-section";
import { HomepageFooter } from "./homepage-footer";
import { HomepageHeroSection } from "./homepage-hero-section";
import { HomepageTopNav } from "./homepage-top-nav";

export function Homepage() {
	return (
		<div className="bg-[#101417] text-[#e0e2e7]">
			<HomepageTopNav />
			<main>
				<HomepageHeroSection />
				<HomepageFeatureGridSection />
				<HomepageDependencyGraphSection />
				<HomepageCodeExampleSection />
				<HomepageCtaSection />
			</main>
			<HomepageFooter />
		</div>
	);
}
