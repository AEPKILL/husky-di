/**
 * @overview Three.js coin animation used in the homepage hero section.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

import styles from "../styles/homepage.module.css";

const HOMEPAGE_HERO_COIN_SPIN_SPEED = 0.3;
const HOMEPAGE_HERO_COIN_WOBBLE_AMOUNT = 0.2;

function HomepageHeroCoinScene() {
	const coinRef = useRef<Mesh | null>(null);

	useFrame((state, delta) => {
		const coin = coinRef.current;

		if (coin == null) {
			return;
		}

		coin.rotation.z += delta * HOMEPAGE_HERO_COIN_SPIN_SPEED;
		coin.rotation.y =
			Math.sin(state.clock.elapsedTime) * HOMEPAGE_HERO_COIN_WOBBLE_AMOUNT;
	});

	return (
		<>
			<ambientLight intensity={0.4} />
			<directionalLight color="#00e676" intensity={1.5} position={[5, 5, 5]} />
			<pointLight distance={10} intensity={0.8} position={[-5, -2, 2]} />

			<mesh ref={coinRef} rotation={[Math.PI / 2, 0, 0]}>
				<cylinderGeometry args={[1.8, 1.8, 0.15, 64]} />
				<meshPhongMaterial
					color="#1f2227"
					flatShading={false}
					shininess={100}
					specular="#00e676"
				/>
			</mesh>
		</>
	);
}

export function HomepageHeroCoin3d() {
	return (
		<div className={`${styles.threeCanvas} h-125 w-full`}>
			<Canvas
				camera={{ fov: 45, position: [0, 0, 5] }}
				className={styles.threeCanvasElement}
				dpr={[1, 2]}
				gl={{ alpha: true, antialias: true }}
			>
				<HomepageHeroCoinScene />
			</Canvas>
		</div>
	);
}
