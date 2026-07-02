/**
 * @overview Root homepage route that mounts the home page module.
 * @author AEPKILL
 * @created 2026-06-30 19:05:00
 */

import { createFileRoute } from "@tanstack/react-router";
import { HomePage, loadHomepageRouteData } from "./home/index";

export const Route = createFileRoute("/")({
	loader: loadHomepageRouteData,
	component: HomeRoutePage,
});

function HomeRoutePage() {
	const routeData = Route.useLoaderData();

	return <HomePage tutorialSteps={routeData.tutorialSteps} />;
}
