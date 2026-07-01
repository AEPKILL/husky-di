/**
 * @overview Display animation hook for the homepage hero coin scene.
 * @author AEPKILL
 * @created 2026-07-01 10:38:00
 */

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import type { Group, Material, Mesh, Object3D } from "three";
import { MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_X = 0.22;
const HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_Y = 0.5;
const HOMEPAGE_HERO_COIN_DISPLAY_ROTATION_SPEED_Z = 0.08;
const HOMEPAGE_HERO_COIN_DISPLAY_BASE_TILT_X = 0.24;
const HOMEPAGE_HERO_COIN_DISPLAY_BASE_TILT_Z = -0.08;
const HOMEPAGE_HERO_COIN_DISPLAY_SCALE = 1.8;
const HOMEPAGE_HERO_COIN_INTRO_DURATION_SECONDS = 1.05;
const HOMEPAGE_HERO_COIN_INTRO_START_SCALE = 1.38;
const HOMEPAGE_HERO_COIN_INTRO_START_POSITION_Y = 0.24;
const HOMEPAGE_HERO_COIN_INTRO_START_POSITION_Z = -0.38;
const HOMEPAGE_HERO_COIN_MATERIAL_METALNESS = 1;
const HOMEPAGE_HERO_COIN_MATERIAL_ROUGHNESS = 0.18;
const HOMEPAGE_HERO_COIN_MATERIAL_ENVIRONMENT_INTENSITY = 2.9;
const HOMEPAGE_HERO_COIN_MATERIAL_CLEARCOAT = 0.55;
const HOMEPAGE_HERO_COIN_MATERIAL_CLEARCOAT_ROUGHNESS = 0.18;

function isHomepageHeroCoinMesh(node: Object3D): node is Mesh {
	return "isMesh" in node && node.isMesh === true;
}

function isHomepageHeroCoinMetalMaterial(
	material: Material,
): material is MeshStandardMaterial {
	return material instanceof MeshStandardMaterial;
}

function clampHomepageHeroCoinProgress(value: number) {
	return Math.min(Math.max(value, 0), 1);
}

function easeOutHomepageHeroCoinCubic(progress: number) {
	return 1 - (1 - progress) ** 3;
}

export interface IUseHomepageHeroCoinDisplayAnimationOptions {
	readonly coinModel: GLTF;
	readonly onReady?: () => void;
}

export function useHomepageHeroCoinDisplayAnimation(
	options: Readonly<IUseHomepageHeroCoinDisplayAnimationOptions>,
) {
	const { coinModel, onReady } = options;
	const coinRef = useRef<Group | null>(null);
	const introStartTimeRef = useRef<number | null>(null);

	useLayoutEffect(() => {
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

		introStartTimeRef.current = null;
		const readyFrameId = window.requestAnimationFrame(() => {
			onReady?.();
		});

		return () => {
			window.cancelAnimationFrame(readyFrameId);
		};
	}, [coinModel, onReady]);

	useFrame((state) => {
		const coin = coinRef.current;

		if (coin == null) {
			return;
		}

		if (introStartTimeRef.current == null) {
			introStartTimeRef.current = state.clock.elapsedTime;
		}

		const introProgress = clampHomepageHeroCoinProgress(
			(state.clock.elapsedTime - introStartTimeRef.current) /
				HOMEPAGE_HERO_COIN_INTRO_DURATION_SECONDS,
		);
		const introEasedProgress = easeOutHomepageHeroCoinCubic(introProgress);

		coin.scale.setScalar(
			HOMEPAGE_HERO_COIN_INTRO_START_SCALE +
				(HOMEPAGE_HERO_COIN_DISPLAY_SCALE -
					HOMEPAGE_HERO_COIN_INTRO_START_SCALE) *
					introEasedProgress,
		);
		coin.position.y =
			HOMEPAGE_HERO_COIN_INTRO_START_POSITION_Y * (1 - introEasedProgress);
		coin.position.z =
			HOMEPAGE_HERO_COIN_INTRO_START_POSITION_Z * (1 - introEasedProgress);

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

	return {
		coinRef,
		initialPosition: [
			0,
			HOMEPAGE_HERO_COIN_INTRO_START_POSITION_Y,
			HOMEPAGE_HERO_COIN_INTRO_START_POSITION_Z,
		] as const,
		initialScale: HOMEPAGE_HERO_COIN_INTRO_START_SCALE,
	};
}
