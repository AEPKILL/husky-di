/**
 * @overview Route that showcases a Code Hike powered scrollycoding example.
 * @author AEPKILL
 * @created 2026-06-30 11:38:00
 */

import { createFileRoute } from "@tanstack/react-router";
import { CodehikeScrollyDemo } from "@/components/codehike-scrolly-demo";
import { createCodehikeScrollyDemoSteps } from "@/utils/codehike-scrolly-demo.util";

export const Route = createFileRoute("/codehike-demo")({
	component: CodehikeDemoPage,
	head: () => ({
		meta: [
			{
				title: "Code Hike Demo | Husky DI",
			},
			{
				name: "description",
				content:
					"Scrollycoding example route built with Code Hike inside the Husky DI website workspace.",
			},
		],
	}),
	loader: async () => createCodehikeScrollyDemoSteps(),
});

function CodehikeDemoPage() {
	const steps = Route.useLoaderData();

	return <CodehikeScrollyDemo steps={steps} />;
}
