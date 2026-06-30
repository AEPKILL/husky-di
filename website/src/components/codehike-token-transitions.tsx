/**
 * @overview Code Hike token transition handler adapted from the official
 * Code Hike demo implementation.
 * @author AEPKILL
 * @created 2026-06-30 12:08:00
 */

import {
	type AnnotationHandler,
	type CustomPreProps,
	getPreRef,
	InnerPre,
	InnerToken,
} from "codehike/code";
import {
	calculateTransitions,
	getStartingSnapshot,
	type TokenTransitionsSnapshot,
} from "codehike/utils/token-transitions";
import { Component } from "react";

const MAX_TRANSITION_DURATION_MS = 900;

class CodehikeTokenTransitionsPreWithRef extends Component<CustomPreProps> {
	private readonly _ref;

	public constructor(props: CustomPreProps) {
		super(props);
		this._ref = getPreRef(props);
	}

	public override render() {
		return <InnerPre merge={this.props} style={{ position: "relative" }} />;
	}

	public override getSnapshotBeforeUpdate(): TokenTransitionsSnapshot {
		return getStartingSnapshot(this._ref.current as HTMLPreElement);
	}

	public override componentDidUpdate(
		_prevProps: Readonly<CustomPreProps>,
		_prevState: never,
		snapshot: TokenTransitionsSnapshot,
	) {
		const preElement = this._ref.current as HTMLPreElement;
		const transitions = calculateTransitions(preElement, snapshot);

		for (const { element, keyframes, options } of transitions) {
			const { translateX, translateY, ...otherKeyframes } = keyframes;
			const animationKeyframes: PropertyIndexedKeyframes = {
				...otherKeyframes,
			};

			if (translateX && translateY) {
				animationKeyframes.translate = [
					`${translateX[0]}px ${translateY[0]}px`,
					`${translateX[1]}px ${translateY[1]}px`,
				];
			}

			element.animate(animationKeyframes, {
				delay: options.delay * MAX_TRANSITION_DURATION_MS,
				duration: options.duration * MAX_TRANSITION_DURATION_MS,
				easing: options.easing,
				fill: "both",
			});
		}
	}
}

export const CODEHIKE_TOKEN_TRANSITIONS: AnnotationHandler = {
	name: "token-transitions",
	PreWithRef: CodehikeTokenTransitionsPreWithRef,
	Token: (props) => (
		<InnerToken merge={props} style={{ display: "inline-block" }} />
	),
};
