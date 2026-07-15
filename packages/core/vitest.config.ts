/**
 * @overview Core package Vitest configuration.
 * @author AEPKILL
 * @created 2026-07-15 22:15:00
 */

import { createVitestConfig } from "@husky-di/config/vitest";

export default createVitestConfig(import.meta.url);
