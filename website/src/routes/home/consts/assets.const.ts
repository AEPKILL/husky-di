/**
 * @overview Asset path constants for the Husky DI homepage.
 * @author AEPKILL
 * @created 2026-07-01 16:28:00
 */

export {
	HOME_PAGE_HERO_COIN_DRACO_DECODER_PATH,
	HOME_PAGE_HERO_COIN_MODEL_PATH,
};

const HOME_PAGE_ASSET_BASE_URL = `${import.meta.env.BASE_URL}assets/`;

const HOME_PAGE_HERO_COIN_MODEL_PATH = `${HOME_PAGE_ASSET_BASE_URL}models/coin.glb`;

const HOME_PAGE_HERO_COIN_DRACO_DECODER_PATH = `${HOME_PAGE_ASSET_BASE_URL}draco/gltf/`;
