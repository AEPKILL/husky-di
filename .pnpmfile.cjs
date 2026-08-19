/**
 * @overview pnpm hooks for producing publish-ready package manifests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

"use strict";

module.exports = {
	hooks: {
		beforePacking(manifest) {
			if (manifest.name !== "@husky-di/remote") {
				return manifest;
			}

			const packedManifest = { ...manifest };
			delete packedManifest.devDependencies;
			return packedManifest;
		},
	},
};
