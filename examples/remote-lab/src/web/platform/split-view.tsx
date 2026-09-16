/**
 * @overview Hosts Monaco's native SplitView with stable React portals and accessible resize sashes.
 * @author AEPKILL
 * @created 2026-09-16 22:53:54
 */

import {
	type ReactElement,
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

export enum SplitViewDirectionEnum {
	vertical = 0,
	horizontal = 1,
}

export function SplitView({
	direction,
	separatorLabel,
	children,
}: {
	direction: SplitViewDirectionEnum;
	separatorLabel: string;
	children: [
		ReactElement<SplitViewPaneProps>,
		ReactElement<SplitViewPaneProps>,
	];
}) {
	const host = useRef<HTMLDivElement>(null);
	const panes = children.map((child) => child.props);
	const firstVisible = panes[0].visible ?? true;
	const secondVisible = panes[1].visible ?? true;
	const enabled = firstVisible && secondVisible;
	const horizontal = direction === SplitViewDirectionEnum.horizontal;
	const current = useRef(panes);
	current.current = panes;
	const fraction = useRef(panes[0].defaultSize / 100);
	const [targets] = useState(() =>
		typeof document === "undefined"
			? null
			: panes.map((pane) => {
					const element = document.createElement("div");
					element.id = pane.id;
					element.className = "split-view";
					return element;
				}),
	);
	const [error, setError] = useState<string>();
	const synchronize = useRef<
		((visibility: readonly [boolean, boolean]) => void) | undefined
	>(undefined);

	// Visibility changes update native view constraints without detaching portal roots.
	useLayoutEffect(() => {
		const container = host.current;
		if (!container || !targets) return;
		let cancelled = false;
		let dispose: (() => void) | undefined;
		void import("monaco-editor/base/browser/ui/splitview/splitview")
			.then(({ SplitView: MonacoSplitView }) => {
				if (cancelled) return;
				const descriptors = current.current;
				const isEnabled = () =>
					current.current.every((pane) => pane.visible !== false);
				const notify: Array<((size?: number) => void) | undefined> = [];
				let size =
					(horizontal ? container.clientWidth : container.clientHeight) || 1000;
				const split = new MonacoSplitView(container, {
					orientation: direction,
					descriptor: {
						size,
						views: descriptors.map((pane, index) => ({
							size:
								size * (index === 0 ? fraction.current : 1 - fraction.current),
							visible: true,
							view: {
								element: targets[index],
								get minimumSize() {
									return isEnabled() ? (size * pane.minSize) / 100 : 0;
								},
								get maximumSize() {
									return current.current[index].visible === false
										? 0
										: Number.POSITIVE_INFINITY;
								},
								onDidChange: (listener) => {
									notify[index] = listener;
									return {
										dispose() {
											notify[index] = undefined;
										},
									};
								},
								layout() {},
							},
						})),
					},
				});
				const sash = container.querySelector<HTMLElement>(
					":scope > .monaco-split-view2 > .sash-container > .monaco-sash",
				);
				if (!sash) {
					split.dispose();
					throw new Error("Monaco SplitView did not create its resize sash");
				}
				sash.setAttribute("role", "separator");
				sash.setAttribute("aria-label", separatorLabel);
				sash.setAttribute(
					"aria-controls",
					descriptors.map((pane) => pane.id).join(" "),
				);
				sash.setAttribute(
					"aria-orientation",
					horizontal ? "vertical" : "horizontal",
				);
				const updateValue = () => {
					sash.setAttribute("aria-valuemin", String(descriptors[0].minSize));
					sash.setAttribute(
						"aria-valuemax",
						String(100 - descriptors[1].minSize),
					);
					sash.setAttribute(
						"aria-valuenow",
						String(Math.round((split.getViewSize(0) / size) * 100)),
					);
				};
				const remember = () => {
					if (isEnabled()) fraction.current = split.getViewSize(0) / size;
					updateValue();
				};
				const resize = (value: number) => {
					split.resizeView(0, value);
					remember();
				};
				const onKeyDown = (event: KeyboardEvent) => {
					if (!isEnabled()) return;
					const previous = horizontal ? "ArrowLeft" : "ArrowUp";
					const next = horizontal ? "ArrowRight" : "ArrowDown";
					const step = size * (event.shiftKey ? 0.1 : 0.01);
					let target: number;
					if (event.key === previous) target = split.getViewSize(0) - step;
					else if (event.key === next) target = split.getViewSize(0) + step;
					else if (event.key === "Home") target = 0;
					else if (event.key === "End") target = size;
					else return;
					event.preventDefault();
					resize(target);
				};
				const changed = split.onDidSashChange(remember);
				const reset = split.onDidSashReset(() =>
					resize((size * descriptors[0].defaultSize) / 100),
				);
				sash.addEventListener("keydown", onKeyDown);
				const layout = () => {
					const nextSize = horizontal
						? container.clientWidth
						: container.clientHeight;
					// A hidden ancestor must not replace the last useful split with zero.
					if (nextSize <= 0) return;
					size = nextSize;
					split.layout(size);
					updateValue();
				};
				synchronize.current = (visibility) => {
					const enabled = visibility.every(Boolean);
					sash.setAttribute("aria-disabled", String(!enabled));
					sash.tabIndex = enabled ? 0 : -1;
					sash.hidden = !enabled;
					visibility.forEach((visible, index) => {
						targets[index].hidden = !visible;
						const portion =
							index === 0 ? fraction.current : 1 - fraction.current;
						notify[index]?.(!visible ? 0 : enabled ? size * portion : size);
					});
					layout();
				};
				const observer = new ResizeObserver(layout);
				observer.observe(container);
				synchronize.current([
					descriptors[0].visible !== false,
					descriptors[1].visible !== false,
				]);
				dispose = () => {
					synchronize.current = undefined;
					observer.disconnect();
					changed.dispose();
					reset.dispose();
					sash.removeEventListener("keydown", onKeyDown);
					split.dispose();
					container.querySelector(":scope > .monaco-split-view2")?.remove();
				};
			})
			.catch((failure) => {
				if (!cancelled) setError(String(failure));
			});
		return () => {
			cancelled = true;
			dispose?.();
		};
	}, [direction, horizontal, separatorLabel, targets]);

	useLayoutEffect(() => {
		// Both flags matter when compact navigation switches which single pane is shown.
		synchronize.current?.([firstVisible, secondVisible]);
	}, [firstVisible, secondVisible]);

	return (
		<div ref={host} className="platform-split-view">
			{error ? <p role="alert">Could not load panel layout：{error}</p> : null}
			{targets ? (
				panes.map((pane, index) =>
					createPortal(pane.children, targets[index], pane.id),
				)
			) : (
				<div
					className={`monaco-split-view2 ${horizontal ? "horizontal" : "vertical"}`}
				>
					<div className="sash-container">
						<hr
							aria-label={separatorLabel}
							aria-orientation={horizontal ? "vertical" : "horizontal"}
							aria-valuenow={panes[0].defaultSize}
							aria-disabled={!enabled}
							tabIndex={enabled ? 0 : undefined}
							hidden={!enabled}
						/>
					</div>
					<div className="split-view-container">
						{panes.map((pane) => (
							<div
								key={pane.id}
								className={`split-view-view${pane.visible === false ? "" : " visible"}`}
								hidden={pane.visible === false}
							>
								<div id={pane.id} className="split-view">
									{pane.children}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export function SplitViewPane({ children }: SplitViewPaneProps) {
	return children;
}

type SplitViewPaneProps = {
	id: string;
	defaultSize: number;
	minSize: number;
	visible?: boolean;
	children: ReactNode;
};
