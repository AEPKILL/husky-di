/**
 * @overview Tick-based animation hook for low-frequency website animations.
 * @author AEPKILL
 * @created 2026-06-30 10:57:00
 */

import { useEffect, useState } from "react";

type UseAnimationTickOptions = {
	intervalMs: number;
	respectReducedMotion?: boolean;
};

export function useAnimationTick(
	options: Readonly<UseAnimationTickOptions>,
): number {
	const { intervalMs, respectReducedMotion = true } = options;
	const [tick, setTick] = useState(0);

	useEffect(() => {
		if (
			respectReducedMotion &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		const intervalId = window.setInterval(() => {
			setTick((previousTick) => previousTick + 1);
		}, intervalMs);

		return () => window.clearInterval(intervalId);
	}, [intervalMs, respectReducedMotion]);

	return tick;
}
