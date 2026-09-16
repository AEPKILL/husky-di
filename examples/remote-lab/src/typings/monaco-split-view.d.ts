/**
 * @overview Describes the bundled Monaco SplitView API used by the workbench's React adapter.
 * @author AEPKILL
 * @created 2026-09-16 22:53:54
 */

declare module "monaco-editor/base/browser/ui/splitview/splitview" {
	export class SplitView {
		constructor(
			container: HTMLElement,
			options: {
				orientation: number;
				descriptor: {
					size: number;
					views: Array<{
						size: number;
						visible: boolean;
						view: {
							element: HTMLElement;
							readonly minimumSize: number;
							readonly maximumSize: number;
							onDidChange: (listener: (size?: number) => void) => {
								dispose(): void;
							};
							layout(size: number, offset: number): void;
						};
					}>;
				};
			},
		);
		layout(size: number): void;
		getViewSize(index: number): number;
		resizeView(index: number, size: number): void;
		onDidSashChange(listener: (index: number) => void): { dispose(): void };
		onDidSashReset(listener: (index: number) => void): { dispose(): void };
		dispose(): void;
	}
}
