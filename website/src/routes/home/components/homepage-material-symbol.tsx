/**
 * @overview Material Symbols wrapper used by the homepage sections.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { cn } from "@/utils/class-name.util";
import styles from "../styles/homepage.module.css";

export type HomepageMaterialSymbolProps = Readonly<{
	className?: string;
	name: "keyboard_arrow_down" | "shield";
}>;

export function HomepageMaterialSymbol({
	className,
	name,
}: HomepageMaterialSymbolProps) {
	return (
		<span aria-hidden="true" className={cn(styles.materialSymbol, className)}>
			{name}
		</span>
	);
}
