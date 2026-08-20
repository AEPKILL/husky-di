/**
 * @overview Runs the React Web UI and proxies RPC WebSockets to the Hono server.
 * @author AEPKILL
 * @created 2026-08-21 00:08:00
 */

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss(), react()],
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		host: "127.0.0.1",
		port: 5_173,
		strictPort: true,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:3000",
			},
			"/rpc": {
				target: "ws://127.0.0.1:3000",
				ws: true,
			},
		},
	},
});
