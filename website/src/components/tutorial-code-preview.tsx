/**
 * @overview Code-oriented preview component for MDX tutorial steps.
 * @author AEPKILL
 * @created 2026-07-01 19:25:00
 */

import { TutorialPreviewFrame } from "@/components/tutorial-preview-frame";

export type TutorialCodePreviewProps = Readonly<{
	className?: string;
	code: string;
	fileName: string;
	title: string;
}>;

export function TutorialCodePreview({
	className = "",
	code,
	fileName,
	title,
}: TutorialCodePreviewProps) {
	return (
		<TutorialPreviewFrame
			badge={fileName}
			bodyClassName="p-0"
			className={className}
			eyebrow="Code"
			title={title}
		>
			<div className="max-h-[44vh] overflow-auto px-4 py-4 md:max-h-[56vh] xl:max-h-[60vh]">
				<pre className="font-mono text-[12px] leading-6 whitespace-pre text-term-fg md:text-[13px]">
					<code>{code}</code>
				</pre>
			</div>
		</TutorialPreviewFrame>
	);
}
