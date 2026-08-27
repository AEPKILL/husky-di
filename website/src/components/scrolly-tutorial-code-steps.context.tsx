/**
 * @overview Context for scrolly tutorial code steps so MDX-authored sections
 * can resolve highlighted code without importing loader data directly.
 * @author AEPKILL
 * @created 2026-07-02 18:20:00
 */

import { createContext, type ReactNode, useContext } from "react";
import type { ScrollyTutorialStep } from "@/types/scrolly-tutorial-step.type";

export type ScrollyTutorialCodeStepsProviderProps = Readonly<{
	children: ReactNode;
	steps: readonly ScrollyTutorialStep[];
}>;

export function ScrollyTutorialCodeStepsProvider({
	children,
	steps,
}: ScrollyTutorialCodeStepsProviderProps) {
	return (
		<ScrollyTutorialCodeStepsContext.Provider value={createCodeStepsMap(steps)}>
			{children}
		</ScrollyTutorialCodeStepsContext.Provider>
	);
}

export function useScrollyTutorialCodeStep(
	stepId: string,
): ScrollyTutorialStep {
	const codeSteps = useScrollyTutorialCodeStepsMap();
	const step = codeSteps.get(stepId);

	if (!step) {
		throw new Error(
			`Scrolly tutorial code step "${stepId}" was not found in the current loader data.`,
		);
	}

	return step;
}

export function useScrollyTutorialCodeStepsMap(): ScrollyTutorialCodeStepsMap {
	const codeSteps = useContext(ScrollyTutorialCodeStepsContext);

	if (!codeSteps) {
		throw new Error(
			"Scrolly tutorial code steps context is unavailable. Wrap the tutorial in ScrollyTutorialCodeStepsProvider.",
		);
	}

	return codeSteps;
}

type ScrollyTutorialCodeStepsMap = ReadonlyMap<string, ScrollyTutorialStep>;

const ScrollyTutorialCodeStepsContext =
	createContext<ScrollyTutorialCodeStepsMap | null>(null);

function createCodeStepsMap(
	steps: readonly ScrollyTutorialStep[],
): ScrollyTutorialCodeStepsMap {
	return new Map(steps.map((step) => [step.id, step] as const));
}
