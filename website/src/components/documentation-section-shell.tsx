/**
 * @overview Shared shell for guide and reference route groups on the Husky DI
 * documentation website.
 * @author Codex
 * @created 2026-06-25 21:40:00
 */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/utils/class-name.utils";

interface IDocumentationSectionShellProps {
	children: ReactNode;
	description: string;
	eyebrow: string;
	links: Array<{
		label: string;
		to: string;
	}>;
	title: string;
}

export function DocumentationSectionShell(
	props: Readonly<IDocumentationSectionShellProps>,
) {
	return (
		<section className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 md:px-6 md:pb-24">
			<div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-10">
				<aside className="lg:sticky lg:top-28 lg:self-start">
					<div className="rounded-[1.5rem] border border-[var(--surface-stroke)] bg-[var(--surface-strong)] p-6 shadow-[var(--panel-shadow)] backdrop-blur">
						<p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.22em] text-[var(--fg-4)]">
							{props.eyebrow}
						</p>
						<h2 className="max-w-[14rem] text-[2rem] font-bold leading-[0.95] tracking-[-0.04em] text-[var(--fg-1)]">
							{props.title}
						</h2>
						<p className="mt-4 text-sm leading-6 text-[var(--fg-3)]">
							{props.description}
						</p>
						<nav className="mt-8 grid gap-2" aria-label={props.eyebrow}>
							{props.links.map((linkEntry) => (
								<Link
									key={linkEntry.to}
									to={linkEntry.to}
									activeOptions={{
										exact:
											linkEntry.to.endsWith("/guides") ||
											linkEntry.to.endsWith("/reference"),
									}}
									activeProps={{
										className: cn(
											"flex min-h-12 items-center rounded-xl border border-transparent bg-[var(--fg-1)] px-4 text-sm font-bold text-[var(--bg-1)]",
										),
									}}
									inactiveProps={{
										className: cn(
											"flex min-h-12 items-center rounded-xl border border-[var(--surface-stroke)] bg-[var(--bg-2)] px-4 text-sm font-bold text-[var(--fg-3)] transition-colors duration-150 hover:border-[var(--fg-5)] hover:text-[var(--fg-1)]",
										),
									}}
								>
									{linkEntry.label}
								</Link>
							))}
						</nav>
					</div>
				</aside>
				<div className="min-w-0 rounded-[1.75rem] border border-[var(--surface-stroke)] bg-[var(--surface-soft)] p-6 shadow-[var(--panel-shadow)] backdrop-blur md:p-8">
					{props.children}
				</div>
			</div>
		</section>
	);
}
