/**
 * @overview Homepage wrapper that renders the Code Hike powered scrollytelling
 * tutorial content.
 * @author AEPKILL
 * @created 2026-07-02 14:35:00
 */

import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";
import { HomepageScrollyTutorial } from "./homepage-scrolly-tutorial";

export type HomepageTutorialSectionProps = Readonly<{
	steps: readonly CodehikeScrollyDemoStep[];
}>;

export function HomepageTutorialSection({
	steps,
}: HomepageTutorialSectionProps) {
	return <HomepageScrollyTutorial steps={steps} />;
}
