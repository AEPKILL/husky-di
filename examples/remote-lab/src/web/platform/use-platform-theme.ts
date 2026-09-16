/**
 * @overview Shares the persisted workbench theme preference and live system color scheme.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { useEffect, useState } from "react";

export enum PlatformThemeEnum {
	system = "system",
	light = "light",
	dark = "dark",
}

export function usePlatformTheme() {
	const [theme, setTheme] = useState(() => {
		try {
			const saved = localStorage.getItem("remote-lab.theme.v1");
			if (saved === PlatformThemeEnum.light || saved === PlatformThemeEnum.dark)
				return saved;
		} catch {
			// A blocked preference store must not prevent editing the project.
		}
		return PlatformThemeEnum.system;
	});
	const [systemDark, setSystemDark] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches,
	);

	useEffect(() => {
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const update = () => setSystemDark(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		try {
			localStorage.setItem("remote-lab.theme.v1", theme);
		} catch {
			// The selected theme still applies for this page when storage is unavailable.
		}
	}, [theme]);

	const resolvedTheme =
		theme === PlatformThemeEnum.system
			? systemDark
				? PlatformThemeEnum.dark
				: PlatformThemeEnum.light
			: theme;
	return { theme, setTheme, resolvedTheme };
}
