/**
 * @overview Three.js coin animation used in the homepage hero section.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { useEffect, useRef } from "react";
import styles from "../styles/homepage.module.css";

export function HomepageHeroCoin3d() {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let animationFrameId = 0;
		let isDisposed = false;
		let cleanup = () => {};

		void (async () => {
			const THREE = await import("three");
			const container = containerRef.current;

			if (isDisposed || container == null) {
				return;
			}

			const scene = new THREE.Scene();
			const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
			camera.position.z = 5;

			const renderer = new THREE.WebGLRenderer({
				alpha: true,
				antialias: true,
			});
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.domElement.className = styles.threeCanvasElement;
			container.appendChild(renderer.domElement);

			const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
			scene.add(ambientLight);

			const mainLight = new THREE.DirectionalLight(0x00e676, 1.5);
			mainLight.position.set(5, 5, 5);
			scene.add(mainLight);

			const rimLight = new THREE.PointLight(0xffffff, 0.8, 10);
			rimLight.position.set(-5, -2, 2);
			scene.add(rimLight);

			const geometry = new THREE.CylinderGeometry(1.8, 1.8, 0.15, 64);
			const material = new THREE.MeshPhongMaterial({
				color: 0x1f2227,
				specular: 0x00e676,
				shininess: 100,
				flatShading: false,
			});

			const coin = new THREE.Mesh(geometry, material);
			coin.rotation.x = Math.PI / 2;
			scene.add(coin);

			const ringGeometry = new THREE.TorusGeometry(1.85, 0.05, 16, 100);
			const ringMaterial = new THREE.MeshPhongMaterial({
				color: 0x00e676,
				emissive: 0x00e676,
				emissiveIntensity: 0.2,
			});
			const ring = new THREE.Mesh(ringGeometry, ringMaterial);
			coin.add(ring);

			const resizeScene = () => {
				const width = container.clientWidth || window.innerWidth;
				const height = container.clientHeight || window.innerHeight;
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
				renderer.setSize(width, height);
			};

			const animate = () => {
				animationFrameId = window.requestAnimationFrame(animate);
				coin.rotation.z += 0.005;
				coin.rotation.y = Math.sin(Date.now() * 0.001) * 0.2;
				renderer.render(scene, camera);
			};

			window.addEventListener("resize", resizeScene);
			resizeScene();
			animate();

			cleanup = () => {
				window.cancelAnimationFrame(animationFrameId);
				window.removeEventListener("resize", resizeScene);
				geometry.dispose();
				material.dispose();
				ringGeometry.dispose();
				ringMaterial.dispose();
				renderer.dispose();
				container.replaceChildren();
			};
		})();

		return () => {
			isDisposed = true;
			cleanup();
		};
	}, []);

	return (
		<div
			className={`${styles.threeCanvas} h-[500px] w-full`}
			ref={containerRef}
		/>
	);
}
