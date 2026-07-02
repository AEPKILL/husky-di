/**
 * @overview Homepage route module shared by the root and /home routes.
 * @author AEPKILL
 * @created 2026-06-26 10:20:00
 */

import { createFileRoute } from "@tanstack/react-router";
import { createHomepageScrollyTutorialSteps } from "@/utils/homepage-scrolly-tutorial.util";
import { Homepage } from "./components/homepage";

export async function loadHomepageRouteData() {
	return {
		tutorialSteps: await createHomepageScrollyTutorialSteps(),
	};
}

export const Route = createFileRoute("/home/")({
	loader: loadHomepageRouteData,
	component: HomeRoutePage,
});

export type HomePageProps = Readonly<{
	tutorialSteps: Awaited<ReturnType<typeof createHomepageScrollyTutorialSteps>>;
}>;

function HomeRoutePage() {
	const routeData = Route.useLoaderData();

	return <Homepage tutorialSteps={routeData.tutorialSteps} />;
}

export function HomePage({ tutorialSteps }: HomePageProps) {
	return <Homepage tutorialSteps={tutorialSteps} />;
}
