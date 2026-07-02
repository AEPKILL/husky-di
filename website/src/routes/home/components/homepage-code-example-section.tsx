/**
 * @overview Code example section for the homepage.
 * @author AEPKILL
 * @created 2026-06-30 17:45:00
 */

import { CodeContainer } from "@/components/code-container";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import {
	HOME_PAGE_CODE_BLOCK_FILE_NAME,
	HOME_PAGE_INSTALL_COMMAND,
} from "../consts/homepage.const";
import { HomepageMaterialSymbol } from "./homepage-material-symbol";

export function HomepageCodeExampleSection() {
	const { copyText, isCopied } = useCopyFeedback();

	const handleCopy = async () => {
		await copyText(HOME_PAGE_INSTALL_COMMAND.codeSample);
	};

	return (
		<section className="border-t border-border bg-page-bg py-10">
			<div className="mx-auto max-w-[1200px] px-6">
				<div className="mb-6">
					<h2 className="text-center font-sans text-[32px] font-semibold leading-10 tracking-[-0.01em] text-page-fg">
						Seamless Integration
					</h2>
					<p className="mx-auto mt-2 max-w-2xl text-center text-base leading-6 text-page-muted">
						Implementation stays explicit and close to the core API. No
						decorators required, just clear TypeScript registration and
						resolution.
					</p>
				</div>

				<CodeContainer
					actions={
						<button
							className="flex items-center gap-1 text-page-muted transition-colors hover:text-accent"
							onClick={handleCopy}
							type="button"
						>
							<HomepageMaterialSymbol className="text-sm" name="content_copy" />
							<span className="font-mono text-[11px] uppercase tracking-[0.08em]">
								{isCopied ? "Copied" : "Copy"}
							</span>
						</button>
					}
					bodyClassName="overflow-x-auto p-6 font-mono text-sm leading-6"
					className="mx-auto max-w-3xl"
					fileName={HOME_PAGE_CODE_BLOCK_FILE_NAME}
				>
					<pre className="text-page-fg">
						<span className="text-code-keyword">import</span>
						{" {"}
						<span className="text-code-symbol"> createContainer</span>,
						<br />
						<span className="text-code-symbol"> createServiceIdentifier</span>,
						<br />
						<span className="text-code-symbol"> resolve</span>,
						<br />
						{"} "}
						<span className="text-code-keyword">from</span>{" "}
						<span className="text-code-type">'@husky-di/core'</span>;{"\n\n"}
						<span className="text-code-comment">
							{"// 1. Define contracts and services"}
						</span>
						{"\n"}
						<span className="text-code-keyword">interface</span>{" "}
						<span className="text-page-fg">Logger</span> {"{"}
						<br />
						{"  "}
						<span className="text-page-fg">log</span>(message:{" "}
						<span className="text-code-type">string</span>):{" "}
						<span className="text-code-type">void</span>
						{";"}
						<br />
						{"}"}
						{"\n\n"}
						<span className="text-code-keyword">class</span>{" "}
						<span className="text-code-symbol">ConsoleLogger</span>{" "}
						<span className="text-code-keyword">implements</span>{" "}
						<span className="text-page-fg">Logger</span> {"{"}
						<br />
						{"  "}
						<span className="text-page-fg">log</span>(message:{" "}
						<span className="text-code-type">string</span>) {"{"}
						<br />
						{"    "}
						console.log(message);
						<br />
						{"  }"}
						<br />
						{"}"}
						{"\n\n"}
						<span className="text-code-keyword">class</span>{" "}
						<span className="text-code-symbol">UserService</span> {"{"}
						<br />
						{"  "}
						<span className="text-code-keyword">private</span>{" "}
						<span className="text-code-keyword">readonly</span>{" "}
						<span className="text-page-fg">logger</span> ={" "}
						<span className="text-page-fg">resolve</span>(
						<span className="text-code-symbol">ILogger</span>);
						<br />
						{"}"}
						{"\n\n"}
						<span className="text-code-comment">
							{"// 2. Create service identifiers and container"}
						</span>
						{"\n"}
						<span className="text-code-keyword">const</span>{" "}
						<span className="text-page-fg">ILogger</span> ={" "}
						<span className="text-page-fg">createServiceIdentifier</span>
						{"<"}
						<span className="text-page-fg">Logger</span>
						{">"}(<span className="text-code-type">"ILogger"</span>);
						{"\n"}
						<span className="text-code-keyword">const</span>{" "}
						<span className="text-page-fg">container</span> ={" "}
						<span className="text-page-fg">createContainer</span>(
						<span className="text-code-type">"AppContainer"</span>);
						{"\n\n"}
						<span className="text-code-comment">
							{"// 3. Register providers and resolve"}
						</span>
						{"\n"}
						<span className="text-page-fg">container</span>.
						<span className="text-code-call">register</span>(
						<span className="text-code-symbol">ILogger</span>, {"{"}
						<br />
						{"  "}
						<span className="text-page-fg">useClass</span>:{" "}
						<span className="text-code-symbol">ConsoleLogger</span>,
						<br />
						{"}"});{"\n"}
						<span className="text-page-fg">container</span>.
						<span className="text-code-call">resolve</span>(
						<span className="text-code-symbol">ILogger</span>);
					</pre>
				</CodeContainer>
			</div>
		</section>
	);
}
