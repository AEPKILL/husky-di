/**
 * @overview Clipboard copy hook with timed feedback state and timeout cleanup.
 * @author AEPKILL
 * @created 2026-07-02 10:25:00
 */

import { useEffect, useRef, useState } from "react";

const DEFAULT_COPY_FEEDBACK_HIDE_DELAY_MS = 1600;

type UseCopyFeedbackOptions = {
	hideDelayMs?: number;
};

export function useCopyFeedback(
	options: Readonly<UseCopyFeedbackOptions> = {},
) {
	const { hideDelayMs = DEFAULT_COPY_FEEDBACK_HIDE_DELAY_MS } = options;
	const [isCopied, setIsCopied] = useState(false);
	const timeoutIdRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (timeoutIdRef.current !== null) {
				window.clearTimeout(timeoutIdRef.current);
			}
		};
	}, []);

	const clearCopyFeedbackTimeout = () => {
		if (timeoutIdRef.current === null) {
			return;
		}

		window.clearTimeout(timeoutIdRef.current);
		timeoutIdRef.current = null;
	};

	const copyText = async (value: string): Promise<boolean> => {
		try {
			await navigator.clipboard.writeText(value);
			clearCopyFeedbackTimeout();
			setIsCopied(true);
			timeoutIdRef.current = window.setTimeout(() => {
				setIsCopied(false);
				timeoutIdRef.current = null;
			}, hideDelayMs);
			return true;
		} catch {
			clearCopyFeedbackTimeout();
			setIsCopied(false);
			return false;
		}
	};

	return {
		copyText,
		isCopied,
	};
}
