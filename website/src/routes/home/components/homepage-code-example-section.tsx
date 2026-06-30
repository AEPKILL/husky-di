/**
 * @overview Code example section for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { useState } from "react";
import {
	HOME_PAGE_CODE_BLOCK_FILE_NAME,
	HOME_PAGE_INSTALL_COMMAND,
} from "../consts/homepage.const";
import styles from "../styles/homepage.module.css";
import { HomepageMaterialSymbol } from "./homepage-material-symbol";

const COPY_FEEDBACK_HIDE_DELAY_MS = 1600;

export function HomepageCodeExampleSection() {
	const [isCopied, setIsCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(HOME_PAGE_INSTALL_COMMAND.codeSample);
			setIsCopied(true);
			window.setTimeout(() => setIsCopied(false), COPY_FEEDBACK_HIDE_DELAY_MS);
		} catch {
			setIsCopied(false);
		}
	};

	return (
		<section className="border-t border-[#3b4a3d] bg-[#101417] py-10">
			<div className="mx-auto max-w-[1200px] px-6">
				<div className="mb-6">
					<h2 className="text-center font-sans text-[32px] font-semibold leading-10 tracking-[-0.01em] text-[#e0e2e7]">
						Seamless Integration
					</h2>
					<p className="mx-auto mt-2 max-w-2xl text-center text-base leading-6 text-[#bacbb9]">
						Implementation stays explicit and close to the core API. No
						decorators required, just clear TypeScript registration and
						resolution.
					</p>
				</div>

				<div
					className={`${styles.codeContainer} mx-auto max-w-3xl overflow-hidden rounded-lg shadow-2xl`}
				>
					<div
						className={`${styles.terminalHeader} flex items-center justify-between bg-[#272a2e] px-4 py-2`}
					>
						<div className="flex items-center gap-2">
							<HomepageMaterialSymbol
								className="text-sm text-[#bacbb9]"
								name="description"
							/>
							<span className="font-mono text-xs text-[#bacbb9]">
								{HOME_PAGE_CODE_BLOCK_FILE_NAME}
							</span>
						</div>

						<button
							className="flex items-center gap-1 text-[#bacbb9] transition-colors hover:text-[#75ff9e]"
							onClick={handleCopy}
							type="button"
						>
							<HomepageMaterialSymbol className="text-sm" name="content_copy" />
							<span className="font-mono text-[11px] uppercase tracking-[0.08em]">
								{isCopied ? "Copied" : "Copy"}
							</span>
						</button>
					</div>

					<div className="overflow-x-auto p-6 font-mono text-sm leading-6">
						<pre className="text-[#e0e2e7]">
							<span className="text-[#ffb866]">import</span>
							{" {"}
							<span className="text-[#62ff96]"> createContainer</span>,
							<br />
							<span className="text-[#62ff96]"> createServiceIdentifier</span>,
							<br />
							<span className="text-[#62ff96]"> resolve</span>,
							<br />
							{"} "}
							<span className="text-[#ffb866]">from</span>{" "}
							<span className="text-[#b0c6ff]">'@husky-di/core'</span>;{"\n\n"}
							<span className="text-[#bacbb9]">
								{"// 1. Define contracts and services"}
							</span>
							{"\n"}
							<span className="text-[#ffb866]">interface</span>{" "}
							<span className="text-[#e0e2e7]">Logger</span> {"{"}
							<br />
							{"  "}
							<span className="text-[#e0e2e7]">log</span>(message:{" "}
							<span className="text-[#b0c6ff]">string</span>):{" "}
							<span className="text-[#b0c6ff]">void</span>
							{";"}
							<br />
							{"}"}
							{"\n\n"}
							<span className="text-[#ffb866]">class</span>{" "}
							<span className="text-[#62ff96]">ConsoleLogger</span>{" "}
							<span className="text-[#ffb866]">implements</span>{" "}
							<span className="text-[#e0e2e7]">Logger</span> {"{"}
							<br />
							{"  "}
							<span className="text-[#e0e2e7]">log</span>(message:{" "}
							<span className="text-[#b0c6ff]">string</span>) {"{"}
							<br />
							{"    "}
							console.log(message);
							<br />
							{"  }"}
							<br />
							{"}"}
							{"\n\n"}
							<span className="text-[#ffb866]">class</span>{" "}
							<span className="text-[#62ff96]">UserService</span> {"{"}
							<br />
							{"  "}
							<span className="text-[#ffb866]">private</span>{" "}
							<span className="text-[#ffb866]">readonly</span>{" "}
							<span className="text-[#e0e2e7]">logger</span> ={" "}
							<span className="text-[#e0e2e7]">resolve</span>(
							<span className="text-[#62ff96]">ILogger</span>);
							<br />
							{"}"}
							{"\n\n"}
							<span className="text-[#bacbb9]">
								{"// 2. Create service identifiers and container"}
							</span>
							{"\n"}
							<span className="text-[#ffb866]">const</span>{" "}
							<span className="text-[#e0e2e7]">ILogger</span> ={" "}
							<span className="text-[#e0e2e7]">createServiceIdentifier</span>
							{"<"}
							<span className="text-[#e0e2e7]">Logger</span>
							{">"}(<span className="text-[#b0c6ff]">"ILogger"</span>);
							{"\n"}
							<span className="text-[#ffb866]">const</span>{" "}
							<span className="text-[#e0e2e7]">container</span> ={" "}
							<span className="text-[#e0e2e7]">createContainer</span>(
							<span className="text-[#b0c6ff]">"AppContainer"</span>);
							{"\n\n"}
							<span className="text-[#bacbb9]">
								{"// 3. Register providers and resolve"}
							</span>
							{"\n"}
							<span className="text-[#e0e2e7]">container</span>.
							<span className="text-[#d9e2ff]">register</span>(
							<span className="text-[#62ff96]">ILogger</span>, {"{"}
							<br />
							{"  "}
							<span className="text-[#e0e2e7]">useClass</span>:{" "}
							<span className="text-[#62ff96]">ConsoleLogger</span>,
							<br />
							{"}"});{"\n"}
							<span className="text-[#e0e2e7]">container</span>.
							<span className="text-[#d9e2ff]">resolve</span>(
							<span className="text-[#62ff96]">ILogger</span>);
						</pre>
					</div>
				</div>
			</div>
		</section>
	);
}
