/**
 * @overview WorkbenchHeader for the Remote Lab workbench.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { MoonStar } from "lucide-react";
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
				<span className="logo">h/</span>
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
					aria-label="切换深浅主题"
					title="切换深浅主题"
				>
					<MoonStar aria-hidden="true" size={18} />
				</Button>
			</div>
		</header>
	);
}
