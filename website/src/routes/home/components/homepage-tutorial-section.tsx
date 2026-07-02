/**
 * @overview Homepage wrapper that renders the MDX-authored scrollytelling
 * tutorial content with loader-provided highlighted code steps.
 * @author AEPKILL
 * @created 2026-07-02 18:20:00
 */

import { ScrollyTutorialCodeStepsProvider } from "@/components/scrolly-tutorial-code-steps.context";
import HomepageTutorialDocument from "@/content/homepage/homepage-tutorial.mdx";
import type { ScrollyTutorialStep } from "@/types/scrolly-tutorial-step.type";

export type HomepageTutorialSectionProps = Readonly<{
	steps: readonly ScrollyTutorialStep[];
}>;

export function HomepageTutorialSection({
	steps,
}: HomepageTutorialSectionProps) {
	return (
		<ScrollyTutorialCodeStepsProvider steps={steps}>
			<HomepageTutorialDocument />
		</ScrollyTutorialCodeStepsProvider>
	);
}
