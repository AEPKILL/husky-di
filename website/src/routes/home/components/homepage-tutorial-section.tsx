/**
 * @overview Homepage wrapper that renders the MDX-authored scrollytelling
 * tutorial content with loader-provided highlighted code steps.
 * @author AEPKILL
 * @created 2026-07-02 18:20:00
 */

import HomepageTutorialDocument from "@/content/homepage/homepage-tutorial.mdx";
import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";
import { HomepageTutorialCodeStepsProvider } from "./homepage-tutorial-code-steps.context";

export type HomepageTutorialSectionProps = Readonly<{
	steps: readonly CodehikeScrollyDemoStep[];
}>;

export function HomepageTutorialSection({
	steps,
}: HomepageTutorialSectionProps) {
	return (
		<HomepageTutorialCodeStepsProvider steps={steps}>
			<HomepageTutorialDocument />
		</HomepageTutorialCodeStepsProvider>
	);
}
