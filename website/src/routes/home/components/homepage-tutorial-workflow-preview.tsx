/**
 * @overview Workflow animation preview used by the homepage MDX tutorial.
 * @author AEPKILL
 * @created 2026-07-01 20:10:00
 */

import { DiWorkflowAnimation } from "@/components/di-workflow-animation";
import { TutorialPreviewFrame } from "@/components/tutorial-preview-frame";

export function HomepageTutorialWorkflowPreview() {
	return (
		<TutorialPreviewFrame
			badge="Live component"
			eyebrow="Demo"
			title="The left pane can render any React component"
		>
			<DiWorkflowAnimation className="min-h-0 bg-transparent px-0 py-0 [&>div]:max-w-none [&>div]:rounded-[1rem] [&>div]:border-border-soft [&>div]:bg-surface-glass [&>div]:px-4 [&>div]:py-5 [&>div]:shadow-none [&_pre]:text-[clamp(0.52rem,1.25vw,0.86rem)]" />
		</TutorialPreviewFrame>
	);
}
