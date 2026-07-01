/**
 * @overview Three.js coin animation used in the homepage hero section.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import type { Group, Material, Mesh, Object3D } from "three";
import {
	ACESFilmicToneMapping,
	MeshPhysicalMaterial,
	MeshStandardMaterial,
	PMREMGenerator,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
	HOME_PAGE_HERO_COIN_DRACO_DECODER_PATH,
	HOME_PAGE_HERO_COIN_MODEL_PATH,
} from "../consts/assets.const";
import styles from "../styles/homepage.module.css";

const HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_X = 0.22;
const HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_Y = 0.5;
const HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_Z = 0.08;
const HOMEPAGE_HERO_COIN_DISPLAY_BASE_TILT_X = 0.24;
const HOMEPAGE_HERO_COIN_DISPLAY_BASE_TILT_Z = -0.08;
const HOMEPAGE_HERO_COIN_MATERIAL_METALNESS = 1;
const HOMEPAGE_HERO_COIN_MATERIAL_ROUGHNESS = 0.18;
const HOMEPAGE_HERO_COIN_MATERIAL_ENVIRONMENT_INTENSITY = 2.9;
const HOMEPAGE_HERO_COIN_MATERIAL_CLEARCOAT = 0.55;
const HOMEPAGE_HERO_COIN_MATERIAL_CLEARCOAT_ROUGHNESS = 0.18;
const HOMEPAGE_HERO_COIN_ENVIRONMENT_BLUR = 0.06;
const HOMEPAGE_HERO_COIN_TONE_MAPPING_EXPOSURE = 1.15;

const homepageHeroCoinDracoLoader = new DRACOLoader();
homepageHeroCoinDracoLoader.setDecoderPath(
	HOME_PAGE_HERO_COIN_DRACO_DECODER_PATH,
);

function isHomepageHeroCoinMesh(node: Object3D): node is Mesh {
	return "isMesh" in node && node.isMesh === true;
}

function isHomepageHeroCoinMetalMaterial(
	material: Material,
): material is MeshStandardMaterial {
	return material instanceof MeshStandardMaterial;
}

function HomepageHeroCoinEnvironment() {
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

function HomepageHeroCoinScene() {
	const coinRef = useRef<Group | null>(null);
	const coinModel = useLoader(
		GLTFLoader,
		HOME_PAGE_HERO_COIN_MODEL_PATH,
		(loader) => {
			loader.setDRACOLoader(homepageHeroCoinDracoLoader);
		},
	);

	useEffect(() => {
		coinModel.scene.traverse((node) => {
			if (!isHomepageHeroCoinMesh(node)) {
				return;
			}

			const materials = Array.isArray(node.material)
				? node.material
				: [node.material];

			for (const material of materials) {
				if (!isHomepageHeroCoinMetalMaterial(material)) {
					continue;
				}

				material.metalness = HOMEPAGE_HERO_COIN_MATERIAL_METALNESS;
				material.roughness = HOMEPAGE_HERO_COIN_MATERIAL_ROUGHNESS;
				material.envMapIntensity =
					HOMEPAGE_HERO_COIN_MATERIAL_ENVIRONMENT_INTENSITY;

				if (material instanceof MeshPhysicalMaterial) {
					material.clearcoat = HOMEPAGE_HERO_COIN_MATERIAL_CLEARCOAT;
					material.clearcoatRoughness =
						HOMEPAGE_HERO_COIN_MATERIAL_CLEARCOAT_ROUGHNESS;
				}

				material.needsUpdate = true;
			}
		});
	}, [coinModel]);

	useFrame((state) => {
		const coin = coinRef.current;

		if (coin == null) {
			return;
		}

		coin.rotation.x =
			HOMEPAGE_HERO_COIN_DISPLAY_BASE_TILT_X +
			state.clock.elapsedTime * HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_X;
		coin.rotation.y =
			state.clock.elapsedTime * HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_Y;
		coin.rotation.z =
			HOMEPAGE_HERO_COIN_DISPLAY_BASE_TILT_Z +
			state.clock.elapsedTime * HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_Z +
			Math.sin(state.clock.elapsedTime * 0.55) * 0.08;
	});

	return (
		<>
			<HomepageHeroCoinEnvironment />
			<ambientLight color="#d8e2e9" intensity={0.18} />
			<hemisphereLight
				args={["#f8fbff", "#081116", 1.5]}
				position={[0, 2, 0]}
			/>
			<spotLight
				angle={0.42}
				color="#ffffff"
				intensity={2.6}
				penumbra={1}
				position={[3.6, 2.8, 5.2]}
			/>
			<spotLight
				angle={0.5}
				color="#75ff9e"
				intensity={1.7}
				penumbra={1}
				position={[-4.2, -0.4, 3.6]}
			/>
			<directionalLight
				color="#a8d4ff"
				intensity={1.8}
				position={[-2.6, 1.8, -4]}
			/>

			<group ref={coinRef} scale={1.8}>
				<primitive object={coinModel.scene} />
			</group>
		</>
	);
}

export function HomepageHeroCoin3d() {
	return (
		<div className={`${styles.threeCanvas} h-125 w-full`}>
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
					<HomepageHeroCoinScene />
				</Suspense>
			</Canvas>
		</div>
	);
}
