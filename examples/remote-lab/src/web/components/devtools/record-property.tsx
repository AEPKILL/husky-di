/**
 * @overview Displays a labeled recorded property as safe text.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

export function RecordProperty({
	name,
	value,
}: {
	readonly name: string;
	readonly value: string;
}) {
	return (
		<div className="property">
			<span className="muted">{name}</span>
			<span className="mono">{value}</span>
		</div>
	);
}
