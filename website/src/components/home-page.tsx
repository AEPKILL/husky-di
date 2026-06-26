/**
 * @overview Reader-first homepage for the Husky DI
 * documentation website.
 * @author Codex
 * @created 2026-06-25 21:40:00
 */

import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Blocks,
	Boxes,
	Cable,
	CheckCircle2,
	ChevronsRight,
	Copy,
	GitBranch,
	RefreshCcw,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { TwoslashCodeBlock } from "@/components/twoslash-code-block";
import {
	CONCEPT_STORIES,
	DOCUMENTATION_JUMP_LINKS,
	HERO_METRICS,
} from "@/constants/home-page.const";
import type { IConceptStory } from "@/types/home-page.type";
import { cn } from "@/utils/class-name.utils";

export function HomePage() {
	return (
		<div className="overflow-x-clip">
			<HeroSection />
			<ProblemContrastSection />
			<ConceptStoriesSection />
			<ModularApiSection />
			<DocumentationJumpSection />
		</div>
	);
}

function HeroSection() {
	return (
		<section className="border-b border-[var(--surface-stroke)]">
			<div className="mx-auto grid w-full max-w-[1440px] gap-12 px-4 pb-24 pt-8 md:px-6 md:pb-28 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-16 lg:pb-36 lg:pt-10">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-15% 0px" }}
					transition={{ duration: 0.45, ease: "easeOut" }}
				>
					<p className="mb-4 text-[0.75rem] font-bold uppercase tracking-[0.22em] text-[var(--fg-4)]">
						Reader-first architecture docs
					</p>
					<h1 className="max-w-[8ch] text-[3.75rem] font-bold leading-[0.86] tracking-[-0.05em] text-[var(--fg-1)] md:text-[4.5rem] lg:text-[5rem]">
						Compose object graphs with proof, not slogans.
					</h1>
					<p className="mt-6 max-w-[20rem] text-lg font-semibold leading-[1.25] text-[var(--fg-2)] md:max-w-[24rem] md:text-xl">
						Husky DI teaches dependency injection through stable boundaries,
						composition roots, and runnable examples that show why the design
						matters.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<CommandChip commandText="pnpm add @husky-di/core" />
						<Link
							to="/guides/getting-started"
							className="inline-flex h-12 items-center gap-2 rounded-sm border border-transparent bg-[var(--accent-red-6)] px-4 text-sm font-bold text-[var(--accent-red-1)] transition-transform duration-150 hover:-translate-y-px"
						>
							Start reading
							<ArrowRight className="size-4" />
						</Link>
					</div>
					<p className="mt-4 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[var(--fg-5)]">
						Hover highlighted identifiers to inspect their types.
					</p>
					<div className="mt-10 grid gap-3">
						{HERO_METRICS.map((metricEntry) => (
							<div
								key={metricEntry.label}
								className="flex items-center justify-between rounded-sm border border-[var(--surface-stroke)] bg-[var(--surface-soft)] px-4 py-3"
							>
								<span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--fg-4)]">
									{metricEntry.label}
								</span>
								<span className="text-right font-mono text-[0.8rem] text-[var(--fg-2)]">
									{metricEntry.value}
								</span>
							</div>
						))}
					</div>
				</motion.div>
				<motion.div
					className="grid gap-4 lg:pt-14"
					initial={{ opacity: 0, y: 24 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-10% 0px" }}
					transition={{ duration: 0.55, ease: "easeOut", delay: 0.08 }}
				>
					<HeroCodePanel />
					<div className="grid gap-4 md:grid-cols-2">
						<InsetCard
							accentHex="var(--accent-orange-1)"
							bodyText="Dependency direction should point toward stable policy, not unstable details."
							iconNode={<Cable className="size-4" />}
							titleText="Why the direct-construction story breaks"
						/>
						<InsetCard
							accentHex="var(--accent-lime-1)"
							bodyText="The homepage leads from practical pain to architecture and then to the first working example."
							iconNode={<Sparkles className="size-4" />}
							titleText="How the onboarding path reads"
						/>
					</div>
				</motion.div>
			</div>
		</section>
	);
}

function ProblemContrastSection() {
	return (
		<section className="border-b border-[var(--surface-light-stroke)] bg-[var(--paper-1)] text-[var(--ink-1)]">
			<div className="mx-auto grid w-full max-w-[1440px] gap-10 px-4 py-20 md:px-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-16 lg:py-28">
				<div>
					<p className="mb-4 text-[0.75rem] font-bold uppercase tracking-[0.22em] text-[var(--ink-4)]">
						Why Husky DI
					</p>
					<h2 className="max-w-[11ch] text-[2.5rem] font-extrabold leading-[0.95] tracking-[-0.04em] text-[var(--ink-1)] md:text-[3rem]">
						Teach the friction before the framework.
					</h2>
					<p className="mt-5 max-w-[24rem] text-lg font-semibold leading-[1.25] text-[var(--ink-2)]">
						The first release should help readers see why direct construction
						makes tests slower, infrastructure stickier, and boundaries harder
						to protect.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<LightContrastCard
						items={[
							"Controllers instantiate repositories directly.",
							"Tests need full infrastructure setup for basic behavior.",
							"Business policy depends on detail classes instead of stable interfaces.",
						]}
						titleText="Before"
					/>
					<LightContrastCard
						accentClassName="text-[var(--accent-green-7)]"
						items={[
							"Composition root assembles dependencies at the application edge.",
							"Tests swap infrastructure with small local registrations.",
							"Policy code depends on stable service identifiers and contracts.",
						]}
						titleText="After"
					/>
				</div>
			</div>
		</section>
	);
}

function ConceptStoriesSection() {
	return (
		<section>
			{CONCEPT_STORIES.map((storyEntry) => (
				<ConceptStorySection key={storyEntry.id} storyEntry={storyEntry} />
			))}
		</section>
	);
}

function ConceptStorySection({
	storyEntry,
}: Readonly<{ storyEntry: IConceptStory }>) {
	return (
		<section
			id={storyEntry.id}
			className="border-b border-[var(--surface-stroke)]"
		>
			<div className="mx-auto grid min-h-[100svh] w-full max-w-[1440px] gap-10 px-4 py-20 md:px-6 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-16 lg:py-24">
				<motion.div
					className="lg:flex lg:min-h-[calc(100svh-10rem)] lg:items-center"
					initial={{ opacity: 0, y: 18 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-18% 0px" }}
					transition={{ duration: 0.4, ease: "easeOut" }}
				>
					<div>
						<p className="mb-4 text-[0.75rem] font-bold uppercase tracking-[0.22em] text-[var(--fg-4)]">
							{storyEntry.eyebrow}
						</p>
						<h2
							className={cn(
								"text-[3rem] font-bold leading-[0.9] tracking-[-0.05em] md:text-[3.75rem]",
								storyEntry.accentClassName,
							)}
						>
							{storyEntry.title}
						</h2>
						<p className="mt-5 max-w-[20rem] text-lg font-semibold leading-[1.25] text-[var(--fg-2)] md:text-xl">
							{storyEntry.description}
						</p>
						<ul className="mt-8 grid gap-3">
							{storyEntry.points.map((pointText) => (
								<li
									key={pointText}
									className="flex gap-3 text-sm leading-6 text-[var(--fg-3)]"
								>
									<CheckCircle2
										className={cn(
											"mt-1 size-4 shrink-0",
											storyEntry.accentClassName,
										)}
									/>
									<span>{pointText}</span>
								</li>
							))}
						</ul>
					</div>
				</motion.div>
				<div className="lg:flex lg:min-h-[calc(100svh-10rem)] lg:items-center">
					<div className="w-full lg:sticky lg:top-28">
						<DemoPanel storyEntry={storyEntry} />
					</div>
				</div>
			</div>
		</section>
	);
}

function ModularApiSection() {
	return (
		<section className="border-b border-[var(--surface-light-stroke)] bg-[var(--paper-1)] text-[var(--ink-1)]">
			<div className="mx-auto grid w-full max-w-[1440px] gap-12 px-4 py-20 md:px-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16 lg:py-28">
				<div>
					<p className="mb-4 text-[0.75rem] font-bold uppercase tracking-[0.22em] text-[var(--ink-4)]">
						Lightweight API / Package Composition
					</p>
					<h2 className="max-w-[10ch] text-[2.5rem] font-extrabold leading-[0.95] tracking-[-0.04em] md:text-[3rem]">
						A modular surface that stays small until you need more.
					</h2>
					<p className="mt-5 max-w-[24rem] text-lg font-semibold leading-[1.25] text-[var(--ink-2)]">
						The website should show that readers can reach first success with
						`@husky-di/core`, then add decorator and module ergonomics when the
						architecture calls for them.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
					<div className="rounded-[1.5rem] border border-[var(--surface-light-stroke)] bg-white/80 p-6 shadow-[0_18px_60px_rgba(37,36,35,0.09)]">
						<p className="text-[0.75rem] font-bold uppercase tracking-[0.18em] text-[var(--ink-4)]">
							Package map
						</p>
						<div className="mt-5 grid gap-3">
							{[
								"@husky-di/core",
								"@husky-di/decorator",
								"@husky-di/module",
							].map((packageName) => (
								<div
									key={packageName}
									className="flex items-center justify-between rounded-xl border border-[var(--surface-light-stroke)] bg-[var(--paper-2)] px-4 py-4"
								>
									<span className="font-mono text-sm text-[var(--ink-1)]">
										{packageName}
									</span>
									<ChevronsRight className="size-4 text-[var(--ink-4)]" />
								</div>
							))}
						</div>
					</div>
					<div className="rounded-[1.5rem] border border-[var(--surface-light-stroke)] bg-[var(--ink-1)] p-6 text-[var(--paper-1)] shadow-[0_18px_60px_rgba(37,36,35,0.12)]">
						<p className="text-[0.75rem] font-bold uppercase tracking-[0.18em] text-white/60">
							First success script
						</p>
						<TwoslashCodeBlock
							className="mt-5 border-white/10 bg-black/15"
							snippetId="first-success-script"
						/>
						<p className="mt-5 text-sm leading-6 text-white/70">
							Keep the smallest working example framework-free so the
							composition boundary stays visible.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

function DocumentationJumpSection() {
	return (
		<section>
			<div className="mx-auto w-full max-w-[1440px] px-4 py-20 md:px-6 lg:py-28">
				<div className="grid gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-16">
					<div>
						<p className="mb-4 text-[0.75rem] font-bold uppercase tracking-[0.22em] text-[var(--fg-4)]">
							Start composing
						</p>
						<h2 className="max-w-[9ch] text-[3rem] font-bold leading-[0.92] tracking-[-0.05em] text-[var(--fg-2)] md:text-[3.75rem]">
							Move from “why” to the first successful run.
						</h2>
						<p className="mt-5 max-w-[23rem] text-lg font-semibold leading-[1.25] text-[var(--fg-3)]">
							The homepage should hand readers a clear next click: understand
							the practical pain, learn the mental model, and then run the
							smallest useful example.
						</p>
					</div>
					<div className="grid gap-3">
						{DOCUMENTATION_JUMP_LINKS.map((linkEntry) => (
							<Link
								key={linkEntry.to}
								to={linkEntry.to}
								className="group rounded-[1.25rem] border border-[var(--surface-stroke)] bg-[var(--surface-strong)] px-5 py-4 transition-transform duration-150 hover:-translate-y-px"
							>
								<div className="flex items-center justify-between gap-3">
									<div>
										<p
											className={cn(
												"text-sm font-bold leading-6",
												linkEntry.accentClassName,
											)}
										>
											{linkEntry.label}
										</p>
										<p className="mt-1 max-w-[34rem] text-sm leading-6 text-[var(--fg-3)]">
											{linkEntry.description}
										</p>
									</div>
									<ArrowRight className="size-4 shrink-0 text-[var(--fg-4)] transition-transform duration-150 group-hover:translate-x-1" />
								</div>
							</Link>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

function HeroCodePanel() {
	return (
		<div className="rounded-[1.75rem] border border-[var(--surface-stroke)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)] backdrop-blur md:p-6">
			<div className="flex items-center justify-between">
				<p className="text-[0.75rem] font-bold uppercase tracking-[0.18em] text-[var(--fg-4)]">
					Composition proof
				</p>
				<div className="flex gap-2">
					<span className="size-2 rounded-full bg-[var(--accent-red-1)]" />
					<span className="size-2 rounded-full bg-[var(--accent-orange-1)]" />
					<span className="size-2 rounded-full bg-[var(--accent-lime-1)]" />
				</div>
			</div>
			<TwoslashCodeBlock className="mt-5" snippetId="hero-intro" />
			<div className="mt-4 grid gap-3 md:grid-cols-3">
				<ProofBadge
					iconNode={<Blocks className="size-4" />}
					labelText="Container"
					valueText="Deterministic"
				/>
				<ProofBadge
					iconNode={<RefreshCcw className="size-4" />}
					labelText="Lifecycles"
					valueText="Visible"
				/>
				<ProofBadge
					iconNode={<ShieldCheck className="size-4" />}
					labelText="Testing"
					valueText="Replaceable"
				/>
			</div>
		</div>
	);
}

function ProofBadge({
	iconNode,
	labelText,
	valueText,
}: Readonly<{
	iconNode: ReactNode;
	labelText: string;
	valueText: string;
}>) {
	return (
		<div className="rounded-xl border border-[var(--surface-stroke)] bg-[var(--bg-2)] px-3 py-3">
			<div className="flex items-center gap-2 text-[var(--fg-4)]">
				{iconNode}
			</div>
			<p className="mt-4 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[var(--fg-4)]">
				{labelText}
			</p>
			<p className="mt-1 font-mono text-xs text-[var(--fg-1)]">{valueText}</p>
		</div>
	);
}

function CommandChip({ commandText }: Readonly<{ commandText: string }>) {
	return (
		<div className="relative inline-flex min-h-12 items-center rounded-sm border border-[var(--surface-stroke)] bg-[var(--bg-2)] pr-12 text-[0.9125rem] text-[var(--fg-3)]">
			<code className="px-4 py-4">{commandText}</code>
			<span className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-[var(--fg-4)]">
				<Copy className="size-4" />
			</span>
		</div>
	);
}

function InsetCard({
	accentHex,
	bodyText,
	iconNode,
	titleText,
}: Readonly<{
	accentHex: string;
	bodyText: string;
	iconNode: ReactNode;
	titleText: string;
}>) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--surface-stroke)] bg-[var(--surface-soft)] p-5">
			<div className="flex items-center gap-2 text-sm font-bold text-[color:var(--fg-2)]">
				<span className="rounded-full border border-[var(--surface-stroke)] p-2">
					{iconNode}
				</span>
				<span style={{ color: accentHex }}>{titleText}</span>
			</div>
			<p className="mt-4 text-sm leading-6 text-[var(--fg-3)]">{bodyText}</p>
		</div>
	);
}

function LightContrastCard({
	accentClassName,
	items,
	titleText,
}: Readonly<{
	accentClassName?: string;
	items: string[];
	titleText: string;
}>) {
	return (
		<div className="rounded-[1.5rem] border border-[var(--surface-light-stroke)] bg-white/70 p-6 shadow-[0_18px_60px_rgba(37,36,35,0.08)]">
			<p
				className={cn(
					"text-sm font-bold uppercase tracking-[0.16em] text-[var(--ink-4)]",
					accentClassName,
				)}
			>
				{titleText}
			</p>
			<ul className="mt-5 grid gap-3">
				{items.map((itemText) => (
					<li
						key={itemText}
						className="flex gap-3 text-sm leading-6 text-[var(--ink-2)]"
					>
						<Boxes className="mt-1 size-4 shrink-0 text-[var(--ink-4)]" />
						<span>{itemText}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function DemoPanel({ storyEntry }: Readonly<{ storyEntry: IConceptStory }>) {
	return (
		<motion.div
			className="rounded-[1.75rem] border border-[var(--surface-stroke)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)] backdrop-blur md:p-6"
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-15% 0px" }}
			transition={{ duration: 0.45, ease: "easeOut" }}
		>
			<div className="flex items-center justify-between">
				<p className={cn("text-sm font-bold", storyEntry.accentClassName)}>
					{storyEntry.eyebrow}
				</p>
				<p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-[var(--fg-5)]">
					Hover for types
				</p>
			</div>
			<div className="mt-5 rounded-[1.25rem] border border-[var(--surface-stroke)] bg-[var(--bg-2)] p-4 md:p-5">
				{renderStoryDemo(storyEntry)}
			</div>
			<TwoslashCodeBlock
				className="mt-4 bg-black/10"
				snippetId={storyEntry.codeBlockId}
			/>
		</motion.div>
	);
}

function renderStoryDemo(storyEntry: IConceptStory) {
	switch (storyEntry.demoKind) {
		case "container":
			return (
				<div className="grid gap-4 md:grid-cols-[11rem_minmax(0,1fr)]">
					<div className="rounded-xl border border-white/8 bg-black/10 p-4">
						<p
							className={cn(
								"text-xs font-bold uppercase tracking-[0.18em]",
								storyEntry.accentClassName,
							)}
						>
							Composition root
						</p>
						<div className="mt-4 grid gap-3">
							{["IClock", "ILogger", "IUserService"].map((itemText) => (
								<div
									key={itemText}
									className="rounded-lg border border-white/8 px-3 py-2 font-mono text-xs text-[var(--fg-2)]"
								>
									{itemText}
								</div>
							))}
						</div>
					</div>
					<div className="rounded-xl border border-white/8 bg-[var(--surface-soft)] p-4">
						<div className="grid gap-3 md:grid-cols-2">
							<NodeCard
								labelText="UserController"
								toneClassName={storyEntry.accentClassName}
							/>
							<NodeCard labelText="UserService" />
							<NodeCard labelText="UserRepository" />
							<NodeCard labelText="Clock" />
						</div>
					</div>
				</div>
			);
		case "resolution":
			return (
				<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
					<div className="rounded-xl border border-white/8 bg-black/10 p-4">
						<p className="font-mono text-xs text-[var(--fg-4)]">
							Resolution trace
						</p>
						<div className="mt-4 grid gap-3">
							{[
								"resolve(IUserService)",
								"-> resolve(IRepository)",
								"-> instantiate(InMemoryRepository)",
								"-> return UserService",
							].map((lineText, index) => (
								<div
									key={lineText}
									className="flex items-center gap-3 rounded-lg border border-white/8 px-3 py-2 text-sm text-[var(--fg-2)]"
								>
									<span
										className={cn(
											"flex size-6 items-center justify-center rounded-full text-xs font-bold",
											index === 0
												? "bg-[var(--accent-orange-6)] text-[var(--accent-orange-1)]"
												: "bg-white/5 text-[var(--fg-4)]",
										)}
									>
										{index + 1}
									</span>
									<span className="font-mono text-xs">{lineText}</span>
								</div>
							))}
						</div>
					</div>
					<div className="rounded-xl border border-white/8 bg-[var(--surface-soft)] p-4">
						<p
							className={cn(
								"text-xs font-bold uppercase tracking-[0.18em]",
								storyEntry.accentClassName,
							)}
						>
							Resolve options
						</p>
						<ul className="mt-4 grid gap-2 text-sm text-[var(--fg-3)]">
							<li>`optional`</li>
							<li>`multiple`</li>
							<li>`ref`</li>
							<li>`dynamic`</li>
						</ul>
					</div>
				</div>
			);
		case "lifecycle":
			return (
				<div className="grid gap-4 md:grid-cols-3">
					{[
						{
							labelText: "Transient",
							toneClassName: "text-[var(--fg-1)]",
							values: [
								"Request A -> new",
								"Request B -> new",
								"Request C -> new",
							],
						},
						{
							labelText: "Singleton",
							toneClassName: storyEntry.accentClassName,
							values: [
								"Request A -> cache",
								"Request B -> reuse",
								"Request C -> reuse",
							],
						},
						{
							labelText: "Resolution",
							toneClassName: "text-[var(--accent-lime-1)]",
							values: ["Chain A -> reuse", "Chain B -> new", "Chain C -> new"],
						},
					].map((columnEntry) => (
						<div
							key={columnEntry.labelText}
							className="rounded-xl border border-white/8 bg-black/10 p-4"
						>
							<p className={cn("text-sm font-bold", columnEntry.toneClassName)}>
								{columnEntry.labelText}
							</p>
							<div className="mt-4 grid gap-2">
								{columnEntry.values.map((valueText) => (
									<div
										key={valueText}
										className="rounded-lg border border-white/8 px-3 py-2 text-xs text-[var(--fg-3)]"
									>
										{valueText}
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			);
		case "refs":
			return (
				<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
					<div className="rounded-xl border border-white/8 bg-black/10 p-4">
						<p className="font-mono text-xs text-[var(--fg-4)]">
							Circular path
						</p>
						<div className="mt-6 flex items-center justify-between gap-3">
							<NodeCard
								labelText="ServiceA"
								toneClassName={storyEntry.accentClassName}
							/>
							<GitBranch className="size-4 text-[var(--fg-5)]" />
							<NodeCard labelText="ServiceB" />
							<GitBranch className="size-4 text-[var(--fg-5)]" />
							<NodeCard labelText="ServiceARef" />
						</div>
					</div>
					<div className="rounded-xl border border-white/8 bg-[var(--surface-soft)] p-4">
						<p
							className={cn(
								"text-xs font-bold uppercase tracking-[0.18em]",
								storyEntry.accentClassName,
							)}
						>
							Escape hatches
						</p>
						<div className="mt-4 grid gap-2">
							<TagChip labelText="ref: true" />
							<TagChip labelText="dynamic: true" />
							<TagChip labelText="trace path" />
						</div>
					</div>
				</div>
			);
		case "modules":
			return (
				<div className="grid gap-4 md:grid-cols-3">
					<ModuleCard
						titleText="core.module"
						items={["IClock", "ILogger", "IConfig"]}
					/>
					<ModuleCard
						titleText="app.module"
						items={[
							"imports core",
							"declares IUserService",
							"exports IUserService",
						]}
						toneClassName={storyEntry.accentClassName}
					/>
					<ModuleCard
						titleText="admin.module"
						items={[
							"imports app",
							"aliases IUserService",
							"exports IAuditView",
						]}
					/>
				</div>
			);
		case "testing":
			return (
				<div className="grid gap-4 md:grid-cols-2">
					<div className="rounded-xl border border-white/8 bg-black/10 p-4">
						<p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--fg-4)]">
							Production
						</p>
						<div className="mt-4 grid gap-2">
							<TagChip labelText="PostgresUserRepository" />
							<TagChip labelText="SmtpEmailGateway" />
							<TagChip labelText="SystemClock" />
						</div>
					</div>
					<div className="rounded-xl border border-white/8 bg-[var(--surface-soft)] p-4">
						<p
							className={cn(
								"text-xs font-bold uppercase tracking-[0.18em]",
								storyEntry.accentClassName,
							)}
						>
							Test container
						</p>
						<div className="mt-4 grid gap-2">
							<TagChip
								labelText="FakeUserRepository"
								toneClassName={storyEntry.accentClassName}
							/>
							<TagChip
								labelText="SpyEmailGateway"
								toneClassName={storyEntry.accentClassName}
							/>
							<TagChip
								labelText="FixedClock"
								toneClassName={storyEntry.accentClassName}
							/>
						</div>
					</div>
				</div>
			);
	}
}

function NodeCard({
	labelText,
	toneClassName,
}: Readonly<{ labelText: string; toneClassName?: string }>) {
	return (
		<div className="rounded-lg border border-white/8 bg-[var(--surface-soft)] px-3 py-4">
			<p className={cn("text-sm font-bold text-[var(--fg-2)]", toneClassName)}>
				{labelText}
			</p>
		</div>
	);
}

function ModuleCard({
	items,
	titleText,
	toneClassName,
}: Readonly<{
	items: string[];
	titleText: string;
	toneClassName?: string;
}>) {
	return (
		<div className="rounded-xl border border-white/8 bg-black/10 p-4">
			<p className={cn("font-mono text-sm text-[var(--fg-2)]", toneClassName)}>
				{titleText}
			</p>
			<ul className="mt-4 grid gap-2 text-sm text-[var(--fg-3)]">
				{items.map((itemText) => (
					<li
						key={itemText}
						className="rounded-lg border border-white/8 px-3 py-2"
					>
						{itemText}
					</li>
				))}
			</ul>
		</div>
	);
}

function TagChip({
	labelText,
	toneClassName,
}: Readonly<{ labelText: string; toneClassName?: string }>) {
	return (
		<div className="inline-flex items-center rounded-full border border-white/8 bg-black/10 px-3 py-2">
			<span
				className={cn("font-mono text-xs text-[var(--fg-2)]", toneClassName)}
			>
				{labelText}
			</span>
		</div>
	);
}
