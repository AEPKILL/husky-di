/**
 * @overview Homepage route for the minimal Husky DI website.
 * @author AEPKILL
 * @created 2026-06-26 10:20:00
 */

import { createFileRoute } from "@tanstack/react-router";
import { DiWorkflowAnimation } from "@/components/di-workflow-animation";

export const Route = createFileRoute("/")({
	component: HomePage,
});

function HomePage() {
	return (
		<section className="home-page">
			<div className="home-page__animation">
				<DiWorkflowAnimation />
			</div>
		</section>
	);
}
