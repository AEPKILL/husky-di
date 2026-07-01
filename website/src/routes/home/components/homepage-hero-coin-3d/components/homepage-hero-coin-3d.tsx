/**
 * @overview Three.js coin animation used in the homepage hero section.
 * @author AEPKILL
 * @created 2026-07-01 10:38:00
 */

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ACESFilmicToneMapping } from "three";
import styles from "../../../styles/homepage.module.css";

import { useHomepageHeroCoinSceneVisibility } from "../hooks/use-homepage-hero-coin-scene-visibility";
import { HomepageHeroCoinScene } from "./homepage-hero-coin-scene";

const HOMEPAGE_HERO_COIN_TONE_MAPPING_EXPOSURE = 1.15;

export function HomepageHeroCoin3d() {
	const { handleSceneReady, isSceneVisible } =
		useHomepageHeroCoinSceneVisibility();

	return (
		<div
			className={`${styles.threeCanvas} ${isSceneVisible ? styles.threeCanvasVisible : ""} h-125 w-full`}
		>
			<Canvas
				camera={{ fov: 42, position: [0, 0, 5] }}
				className={styles.threeCanvasElement}
				dpr={[1, 2]}
				gl={{ alpha: true, antialias: true }}
				onCreated={({ gl }) => {
					gl.toneMapping = ACESFilmicToneMapping;
					gl.toneMappingExposure = HOMEPAGE_HERO_COIN_TONE_MAPPING_EXPOSURE;
				}}
			>
				<Suspense fallback={null}>
					<HomepageHeroCoinScene onReady={handleSceneReady} />
				</Suspense>
			</Canvas>
		</div>
	);
}
