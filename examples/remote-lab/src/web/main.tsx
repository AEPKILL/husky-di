/**
 * @overview Loads the developer platform while retaining the old demo only at its explicit regression route.
 * @author AEPKILL
 * @created 2026-09-10 00:38:10 23:34:16
 */

import { createRoot } from "react-dom/client";
import { PlatformWorkbench } from "@/web/platform/platform-workbench";
import "@/web/platform/platform.css";

if (window.location.pathname.startsWith("/legacy")) {
	void import("./legacy");
} else {
	const element = document.getElementById("root");
	if (!element) throw new Error("Remote Lab root element is missing.");
	createRoot(element).render(<PlatformWorkbench />);
}
