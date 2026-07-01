/**
 * @overview Lighting rig for the homepage hero coin scene.
 * @author AEPKILL
 * @created 2026-07-01 10:38:00
 */

export function HomepageHeroCoinLighting() {
	return (
		<>
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
		</>
	);
}
