/**
 * @overview Remote WebSocket package Vitest configuration.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createVitestConfig } from "@husky-di/config/vitest";

export default createVitestConfig(import.meta.url);
