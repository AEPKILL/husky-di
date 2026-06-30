/**
 * @overview Root homepage route that mounts the home page module.
 * @author AEPKILL
 * @created 2026-06-30 19:05:00
 */

import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "./home/index";

export const Route = createFileRoute("/")({
	component: HomeRoutePage,
});

function HomeRoutePage() {
	return <HomePage />;
}
