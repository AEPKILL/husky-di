/**
 * @overview Homepage route module shared by the root and /home routes.
 * @author AEPKILL
 * @created 2026-06-26 10:20:00
 */

import { createFileRoute } from "@tanstack/react-router";
import HomepageTutorialDocument from "@/content/homepage/homepage-tutorial.mdx";
import type { ScrollyTutorialStep } from "@/types/scrolly-tutorial-step.type";
import { createScrollyTutorialSteps } from "@/utils/scrolly-tutorial.util";
import { Homepage } from "./components/homepage";

export type HomePageProps = Readonly<{
	tutorialSteps: readonly ScrollyTutorialStep[];
}>;

export async function loadHomepageRouteData() {
	return {
		tutorialSteps: await createScrollyTutorialSteps({
			document: HomepageTutorialDocument,
			fileName: "homepage-tutorial.ts",
		}),
	};
}

export const Route = createFileRoute("/home/")({
	loader: loadHomepageRouteData,
	component: HomeRoutePage,
});

export function HomePage({ tutorialSteps }: HomePageProps) {
	return <Homepage tutorialSteps={tutorialSteps} />;
}

function HomeRoutePage() {
	const routeData = Route.useLoaderData();

	return <Homepage tutorialSteps={routeData.tutorialSteps} />;
}
