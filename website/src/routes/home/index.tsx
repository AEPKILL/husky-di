/**
 * @overview Homepage route module shared by the root and /home routes.
 * @author AEPKILL
 * @created 2026-06-26 10:20:00
 */

import { createFileRoute } from "@tanstack/react-router";
import { Homepage } from "./components/homepage";

export const Route = createFileRoute("/home/")({
	component: HomePage,
});

export function HomePage() {
	return <Homepage />;
}
