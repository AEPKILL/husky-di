/**
 * @overview pnpm hooks for producing publish-ready package manifests.
 * @author AEPKILL
 * @created 2026-09-17 00:17:57
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
