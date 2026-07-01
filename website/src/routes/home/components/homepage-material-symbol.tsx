/**
 * @overview Material Symbols wrapper used by the homepage sections.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import styles from "../styles/homepage.module.css";

export type HomepageMaterialSymbolProps = Readonly<{
	className?: string;
	name:
		| "bolt"
		| "check_circle"
		| "content_copy"
		| "description"
		| "keyboard_arrow_down"
		| "settings_input_component"
		| "shield"
		| "terminal";
}>;

export function HomepageMaterialSymbol({
	className,
	name,
}: HomepageMaterialSymbolProps) {
	return (
		<span
			aria-hidden="true"
			className={`${styles.materialSymbol} ${className ?? ""}`.trim()}
		>
			{name}
		</span>
	);
}
