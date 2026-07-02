/**
 * @overview Visual dependency graph preview used by the homepage MDX tutorial.
 * @author AEPKILL
 * @created 2026-07-01 19:25:00
 */

import { TutorialPreviewFrame } from "@/components/tutorial-preview-frame";
import {
	HOME_PAGE_DEPENDENCY_GRAPH_BULLETS,
	HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_ALT,
	HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_URL,
} from "../consts/homepage.const";

export function HomepageTutorialGraphPreview() {
	return (
		<TutorialPreviewFrame
			badge="Visual graph"
			eyebrow="Preview"
			title="Inspect the service graph before resolving it"
		>
			<div className="space-y-4">
				<img
					alt={HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_ALT}
					className="w-full rounded-2xl border border-border-soft shadow-2xl"
					loading="lazy"
					src={HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_URL}
				/>

				<div className="flex flex-wrap gap-2">
					{HOME_PAGE_DEPENDENCY_GRAPH_BULLETS.map((bullet) => (
						<span
							className="rounded-full border border-border bg-surface-alt px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-accent-muted"
							key={bullet}
						>
							{bullet}
						</span>
					))}
				</div>
			</div>
		</TutorialPreviewFrame>
	);
}
