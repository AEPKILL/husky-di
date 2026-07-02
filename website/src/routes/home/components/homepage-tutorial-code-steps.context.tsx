/**
 * @overview Context for homepage tutorial code steps so MDX-authored preview
 * markers can resolve highlighted code without importing loader data directly.
 * @author AEPKILL
 * @created 2026-07-02 18:20:00
 */

import { createContext, type ReactNode, useContext } from "react";
import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";

type HomepageTutorialCodeStepsMap = ReadonlyMap<
	string,
	CodehikeScrollyDemoStep
>;

const HomepageTutorialCodeStepsContext =
	createContext<HomepageTutorialCodeStepsMap | null>(null);

export type HomepageTutorialCodeStepsProviderProps = Readonly<{
	children: ReactNode;
	steps: readonly CodehikeScrollyDemoStep[];
}>;

export function HomepageTutorialCodeStepsProvider({
	children,
	steps,
}: HomepageTutorialCodeStepsProviderProps) {
	return (
		<HomepageTutorialCodeStepsContext.Provider
			value={createCodeStepsMap(steps)}
		>
			{children}
		</HomepageTutorialCodeStepsContext.Provider>
	);
}

export function useHomepageTutorialCodeStep(
	stepId: string,
): CodehikeScrollyDemoStep {
	const codeSteps = useHomepageTutorialCodeStepsMap();

	const step = codeSteps.get(stepId);

	if (!step) {
		throw new Error(
			`Homepage tutorial code step "${stepId}" was not found in the current loader data.`,
		);
	}

	return step;
}

export function useHomepageTutorialCodeStepsMap(): HomepageTutorialCodeStepsMap {
	const codeSteps = useContext(HomepageTutorialCodeStepsContext);

	if (!codeSteps) {
		throw new Error(
			"Homepage tutorial code steps context is unavailable. Wrap the MDX tutorial in HomepageTutorialCodeStepsProvider.",
		);
	}

	return codeSteps;
}

function createCodeStepsMap(
	steps: readonly CodehikeScrollyDemoStep[],
): HomepageTutorialCodeStepsMap {
	return new Map(steps.map((step) => [step.id, step] as const));
}
