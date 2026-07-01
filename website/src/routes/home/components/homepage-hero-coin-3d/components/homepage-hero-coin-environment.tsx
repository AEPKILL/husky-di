/**
 * @overview Environment setup for the homepage hero coin scene.
 * @author AEPKILL
 * @created 2026-07-01 10:38:00
 */

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const HOMEPAGE_HERO_COIN_ENVIRONMENT_BLUR = 0.06;

export function HomepageHeroCoinEnvironment() {
	const { gl, scene } = useThree();

	useEffect(() => {
		const environmentScene = new RoomEnvironment();
		const pmremGenerator = new PMREMGenerator(gl);
		const environmentTexture = pmremGenerator.fromScene(
			environmentScene,
			HOMEPAGE_HERO_COIN_ENVIRONMENT_BLUR,
		).texture;

		scene.environment = environmentTexture;

		return () => {
			if (scene.environment === environmentTexture) {
				scene.environment = null;
			}

			environmentTexture.dispose();
			pmremGenerator.dispose();
		};
	}, [gl, scene]);

	return null;
}
