/**
 * @overview Formats bounded example payload previews without executing getters or serialization hooks.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

export function formatLabValue(value: unknown): string {
	let remaining = 4_096;
	const ancestors = new Set<object>();
	function format(item: unknown, depth: number): string {
		if (remaining <= 0) return "…";
		let text: string;
		if (typeof item === "string")
			text = JSON.stringify(item.slice(0, remaining));
		else if (item === null) text = "null";
		else if (typeof item === "number")
			text = Object.is(item, -0) ? "-0" : String(item);
		else if (typeof item === "boolean" || typeof item === "undefined")
			text = String(item);
		else if (typeof item !== "object") text = `[${typeof item}]`;
		else {
			if (ancestors.has(item)) return "[cycle]";
			if (depth >= 8) return "[depth limit]";
			const array = Array.isArray(item);
			const prototype = Object.getPrototypeOf(item);
			if (!array && prototype !== Object.prototype && prototype !== null)
				return "[unsupported object]";
			ancestors.add(item);
			const parts: string[] = [];
			for (const key of Reflect.ownKeys(item)) {
				if (remaining <= 0 || parts.length >= 64) {
					parts.push("…");
					break;
				}
				const property = Object.getOwnPropertyDescriptor(item, key);
				if (!property?.enumerable) continue;
				const label = array
					? ""
					: `${typeof key === "string" ? JSON.stringify(key.slice(0, 256)) : "[symbol]"}: `;
				remaining -= label.length + 2;
				parts.push(
					label +
						("value" in property
							? format(property.value, depth + 1)
							: "[accessor]"),
				);
			}
			ancestors.delete(item);
			return array ? `[${parts.join(", ")}]` : `{${parts.join(", ")}}`;
		}
		remaining -= text.length;
		return text;
	}
	try {
		const preview = format(value, 0);
		return preview.length > 4_096 ? `${preview.slice(0, 4_095)}…` : preview;
	} catch {
		return "[uninspectable value]";
	}
}
