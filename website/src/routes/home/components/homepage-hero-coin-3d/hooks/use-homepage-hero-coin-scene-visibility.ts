/**
 * @overview Visibility state hook for the homepage hero coin scene.
 * @author AEPKILL
 * @created 2026-07-01 10:38:00
 */

import { useState } from "react";

export function useHomepageHeroCoinSceneVisibility() {
	const [isSceneVisible, setIsSceneVisible] = useState(false);

	const handleSceneReady = () => {
		setIsSceneVisible(true);
	};

	return {
		handleSceneReady,
		isSceneVisible,
	};
}
