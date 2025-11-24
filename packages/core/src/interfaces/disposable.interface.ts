/**
 * @overview
 * @author AEPKILL
 * @created 2022-10-13 17:36:35
 */

export type Cleanup = () => void;

export interface IDisposable {
	readonly disposed: boolean;
	dispose(): void;
}
