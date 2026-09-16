/**
 * @overview WorkbenchHeader for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 09:25:57
 */

import { FlaskConical, MoonStar } from "lucide-react";
import { Button } from "@/web/components/ui/button";
import type { WorkbenchProps } from "@/web/types/workbench.type";

export function WorkbenchHeader({
	texts,
	transportStatus,
	onAction,
}: Pick<WorkbenchProps, "texts" | "transportStatus" | "onAction">) {
	return (
		<header className="app-header">
			<div className="brand">
				<span className="logo" aria-hidden="true">
					<FlaskConical size={22} />
				</span>
				<strong>remote lab</strong>
				<span className="muted">/ WebSocket</span>
			</div>
			<div className="connection">
				<span id="peer-name">{texts["#peer-name"] ?? "Browser ⇄ Node"}</span>
				<strong id="transport" role="status" data-state={transportStatus}>
					{texts["#transport"] ?? "Connecting"}
				</strong>
				<Button
					onClick={onAction}
					variant="outline"
					id="theme"
					className="icon-button"
					aria-label="Toggle light/dark theme"
					title="Toggle light/dark theme"
				>
					<MoonStar aria-hidden="true" size={18} />
				</Button>
			</div>
		</header>
	);
}
