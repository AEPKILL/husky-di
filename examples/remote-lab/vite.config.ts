/**
 * @overview Serves the browser example with same-origin RPC and diagnostics proxies.
 * @author AEPKILL
 * @created 2026-08-21 00:08:00
 */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	server: {
		host: "127.0.0.1",
		port: 5_173,
		strictPort: true,
		proxy: {
			"/rpc": { target: "ws://127.0.0.1:3000", ws: true },
			"/api": "http://127.0.0.1:3000",
			"/health": "http://127.0.0.1:3000",
		},
	},
});
