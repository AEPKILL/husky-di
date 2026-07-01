/**
 * @overview Scene composition for the homepage hero coin canvas.
 * @author AEPKILL
 * @created 2026-07-01 10:38:00
 */

import { useLoader } from "@react-three/fiber";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
	HOME_PAGE_HERO_COIN_DRACO_DECODER_PATH,
	HOME_PAGE_HERO_COIN_MODEL_PATH,
} from "../../../consts/assets.const";
import { useHomepageHeroCoinDisplayAnimation } from "../hooks/use-homepage-hero-coin-display-animation";
import { HomepageHeroCoinEnvironment } from "./homepage-hero-coin-environment";
import { HomepageHeroCoinLighting } from "./homepage-hero-coin-lighting";

const homepageHeroCoinDracoLoader = new DRACOLoader();
homepageHeroCoinDracoLoader.setDecoderPath(
	HOME_PAGE_HERO_COIN_DRACO_DECODER_PATH,
);

export interface IHomepageHeroCoinSceneProps {
	readonly onReady?: () => void;
}

export function HomepageHeroCoinScene(
	props: Readonly<IHomepageHeroCoinSceneProps>,
) {
	const { onReady } = props;
	const coinModel = useLoader(
		GLTFLoader,
		HOME_PAGE_HERO_COIN_MODEL_PATH,
		(loader) => {
			loader.setDRACOLoader(homepageHeroCoinDracoLoader);
		},
	);
	const { coinRef, initialPosition, initialScale } =
		useHomepageHeroCoinDisplayAnimation({
			coinModel,
			onReady,
		});

	return (
		<>
			<HomepageHeroCoinEnvironment />
			<HomepageHeroCoinLighting />
			<group ref={coinRef} position={initialPosition} scale={initialScale}>
				<primitive object={coinModel.scene} />
			</group>
		</>
	);
}
