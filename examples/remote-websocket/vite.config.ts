/**
 * @overview Runs the empty Remote WebSocket example Vite shell.
 * @author AEPKILL
 * @created 2026-08-21 00:08:00
 */

import { defineConfig } from "vite";

export default defineConfig({
	server: {
		host: "127.0.0.1",
		port: 5_173,
		strictPort: true,
	},
});
