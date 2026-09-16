/**
 * @overview Coordinates local TypeScript projects, shared execution, immutable source evidence and persistent history.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { Files, FlaskConical, History, Play } from "lucide-react";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { LabExecutionModeEnum } from "@/enums/platform/execution.enum";
import {
	PlatformRunResultEnum,
	PlatformRunStateEnum,
} from "@/enums/platform-run.enum";
import type {
	PlatformRun,
	PlatformRunSummary,
} from "@/types/platform-run.type";
import { EditorTab } from "./editor-tab";
import { MaterialFileIcon, MaterialFolderIcon } from "./material-file-icon";
import {
	filePath,
	type PlatformDiagnostic,
	type PlatformProjectSummary,
	type PlatformSaveResult,
	type PlatformSourceLocation,
	platformRequest,
	projectPath,
	runPath,
} from "./platform-api";
import { RunEvidence, RunInspector } from "./run-inspector";
import { SplitView, SplitViewDirectionEnum, SplitViewPane } from "./split-view";
import { PlatformThemeEnum, usePlatformTheme } from "./use-platform-theme";
import {
	DocumentSaveStatusEnum,
	useProjectDocuments,
} from "./use-project-documents";

export function PlatformWorkbench() {
	const { theme, setTheme, resolvedTheme } = usePlatformTheme();
	const shell = useRef<HTMLDivElement>(null);
	const [activity, setActivity] = useState(ActivityViewEnum.explorer);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [evidenceOpen, setEvidenceOpen] = useState(false);
	const [compactScreen, setCompactScreen] = useState(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(max-width: 760px)").matches,
	);
	const observedRun = useRef<{
		id?: string;
		activeId?: string;
		state?: PlatformRunStateEnum;
		result?: PlatformRunResultEnum;
	}>({});
	const [projects, setProjects] = useState<PlatformProjectSummary[]>([]);
	const [projectId, setProjectId] = useState<string>();
	const [rootInput, setRootInput] = useState("");
	const [newFile, setNewFile] = useState("");
	const [entry, setEntry] = useState("");
	const [parameters, setParameters] = useState("{}");
	const [openFiles, setOpenFiles] = useState<string[]>([]);
	const [activePath, setActivePath] = useState<string>();
	const [location, setLocation] = useState<PlatformSourceLocation>();
	const [navigationFiles, setNavigationFiles] = useState<
		{ path: string; content: string; readOnly: boolean }[]
	>([]);
	const [diagnostics, setDiagnostics] = useState<PlatformDiagnostic[]>([]);
	const [showDiagnostics, setShowDiagnostics] = useState(false);
	const [runs, setRuns] = useState<PlatformRunSummary[]>([]);
	const [activeRun, setActiveRun] = useState<PlatformRun>();
	const [selectedRun, setSelectedRun] = useState<PlatformRun>();
	const [selectedRunId, setSelectedRunId] = useState<string>();
	const [snapshot, setSnapshot] = useState(false);
	const [stepId, setStepId] = useState<string>();
	const [error, setError] = useState<string>();
	const [pending, setPending] = useState(false);
	const [compactView, setCompactView] = useState(CompactPaneEnum.source);
	const [limits, setLimits] = useState({
		debugRetentionMs: 30_000,
		stopGraceMs: 2_000,
		heartbeatLeaseMs: 6_000,
	});
	const pageId = useRef(crypto.randomUUID());
	const openedInitialFile = useRef(false);
	const selection = useRef(selectedRunId);
	selection.current = selectedRunId;
	const selectedReport = useRef(selectedRun);
	selectedReport.current = selectedRun;
	const {
		documents,
		project,
		error: fileError,
		refresh,
		edit,
		save,
		flush,
		resolveConflict,
	} = useProjectDocuments(projectId);
	const run = selectedRun ?? activeRun;
	const selectedProject = projects.find(
		(candidate) => candidate.id === projectId,
	);
	const projectReady = project?.id === projectId;
	const viewDocuments =
		snapshot && run
			? Object.entries(run.snapshot.files).map(([path, content]) => ({
					path,
					content,
				}))
			: projectReady
				? [...documents, ...navigationFiles]
				: [];
	const visibleOpenFiles = openFiles.filter((path) =>
		viewDocuments.some((document) => document.path === path),
	);
	const activeTabIndex = activePath ? visibleOpenFiles.indexOf(activePath) : -1;
	const sidebarVisible = compactScreen
		? compactView === CompactPaneEnum.project
		: sidebarOpen;
	const conflict = !snapshot
		? documents.find(
				(document) => document.path === activePath && document.conflict,
			)
		: undefined;
	const dirty = documents.filter(
		(document) => document.status !== DocumentSaveStatusEnum.saved,
	);
	const files = projectReady ? (project?.files ?? []) : [];
	const treeFiles =
		snapshot && run
			? Object.keys(run.snapshot.files).map((path) => ({ path }))
			: files;
	const cases = files.filter((file) => file.isCase);

	const inspectorVisible = compactScreen
		? compactView === CompactPaneEnum.execution
		: inspectorOpen;
	const evidenceVisible = compactScreen
		? compactView === CompactPaneEnum.evidence
		: evidenceOpen;
	const activeRunId = activeRun?.id;
	const runId = run?.id;
	const runState = run?.state;
	const runResult = run?.result;

	useEffect(() => {
		const query = window.matchMedia("(max-width: 760px)");
		const update = () => setCompactScreen(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		const previous = observedRun.current;
		observedRun.current = {
			id: runId,
			activeId: activeRunId,
			state: runState,
			result: runResult,
		};
		if (!runId) return;
		const newlySelected = previous.id !== runId;
		const newlyActive = Boolean(
			activeRunId && previous.activeId !== activeRunId,
		);
		const pausedOrRetained =
			!newlySelected &&
			previous.state !== runState &&
			(runState === PlatformRunStateEnum.paused ||
				runState === PlatformRunStateEnum.retained);
		const failed =
			!newlySelected &&
			previous.result !== runResult &&
			(runResult === PlatformRunResultEnum.failed ||
				runResult === PlatformRunResultEnum.error);
		if (newlySelected || newlyActive || pausedOrRetained || failed) {
			setInspectorOpen(true);
			setEvidenceOpen(true);
			// On narrow screens, runtime attention reveals the inspector; history navigation keeps source visible.
			if (newlyActive || pausedOrRetained || failed)
				setCompactView(CompactPaneEnum.execution);
		}
	}, [activeRunId, runId, runState, runResult]);

	const activatePath = useCallback(
		(path: string | undefined, currentSource = !snapshot) => {
			setActivePath(path);
			if (
				path &&
				currentSource &&
				files.some((file) => file.isCase && file.path === path)
			)
				setEntry(path);
		},
		[files, snapshot],
	);

	const navigate = useCallback(
		(
			target: PlatformSourceLocation,
			reveal = true,
			currentSource = !snapshot,
		) => {
			setOpenFiles((current) =>
				current.includes(target.path) ? current : [...current, target.path],
			);
			activatePath(target.path, currentSource);
			setLocation({ ...target });
			if (reveal) setCompactView(CompactPaneEnum.source);
		},
		[activatePath, snapshot],
	);

	const execute = useCallback(async (operation: () => Promise<unknown>) => {
		setPending(true);
		setError(undefined);
		try {
			await operation();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : String(failure));
		} finally {
			setPending(false);
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		void platformRequest<{
			projects: PlatformProjectSummary[];
			limits: typeof limits;
		}>("")
			.then((value) => {
				if (cancelled) return;
				setProjects(value.projects);
				setLimits(value.limits);
				const saved = localStorage.getItem("remote-lab.project.v1");
				const initial =
					value.projects.find((candidate) => candidate.id === saved) ??
					value.projects[0];
				setProjectId(initial?.id);
			})
			.catch((failure) => {
				if (!cancelled) setError(String(failure));
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!projectId) return;
		localStorage.setItem("remote-lab.project.v1", projectId);
		setOpenFiles([]);
		setInspectorOpen(false);
		setEvidenceOpen(false);
		setActivePath(undefined);
		setEntry("");
		setSelectedRun(undefined);
		setSelectedRunId(undefined);
		setActiveRun(undefined);
		setRuns([]);
		setSnapshot(false);
		setStepId(undefined);
		setDiagnostics([]);
		setNavigationFiles([]);
		openedInitialFile.current = false;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const result = await platformRequest<{
					active?: PlatformRun;
					history: PlatformRunSummary[];
				}>(`${projectPath(projectId)}/runs`);
				if (cancelled) return;
				setActiveRun(result.active);
				setRuns(result.history);
				const chosenId = selection.current ?? result.active?.id;
				if (chosenId) {
					const chosen =
						result.active?.id === chosenId
							? result.active
							: result.history.find((candidate) => candidate.id === chosenId);
					if (result.active?.id === chosenId) setSelectedRun(result.active);
					else {
						const previous = selectedReport.current;
						const changed =
							previous?.id !== chosenId ||
							previous?.state !== chosen?.state ||
							previous?.completedAt !== chosen?.completedAt;
						if (changed) {
							const full = await platformRequest<PlatformRun>(
								runPath(projectId, chosenId),
							);
							if (
								!cancelled &&
								(!selection.current || selection.current === chosenId)
							)
								setSelectedRun(full);
						}
					}
					if (!selection.current) setSelectedRunId(chosenId);
				}
			} catch (failure) {
				if (!cancelled)
					setError(
						`Run observation is temporarily unavailable; keeping last evidence：${String(failure)}`,
					);
			}
			if (!cancelled) timer = setTimeout(() => void poll(), 750);
		};
		void poll();
		const heartbeat = () =>
			void platformRequest(`${projectPath(projectId)}/observers`, "POST", {
				pageId: pageId.current,
				connected: true,
			}).catch(() => {});
		heartbeat();
		const heartbeatTimer = setInterval(heartbeat, 2_000);
		const disconnect = () =>
			navigator.sendBeacon(
				`/api/platform${projectPath(projectId)}/observers`,
				new Blob(
					[JSON.stringify({ pageId: pageId.current, connected: false })],
					{ type: "application/json" },
				),
			);
		window.addEventListener("pagehide", disconnect);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			clearInterval(heartbeatTimer);
			window.removeEventListener("pagehide", disconnect);
			disconnect();
		};
	}, [projectId]);

	useEffect(() => {
		if (!projectReady) return;
		if (!entry && cases[0]) setEntry(cases[0].path);
		if (!openedInitialFile.current && documents.length) {
			openedInitialFile.current = true;
			navigate({ path: cases[0]?.path ?? documents[0].path }, false);
		}
	}, [entry, cases, documents, navigate, projectReady]);

	useEffect(() => {
		if (!projectId || snapshot || !documents.length) return;
		let cancelled = false;
		const timer = setTimeout(() => {
			void platformRequest<PlatformDiagnostic[]>(
				`${projectPath(projectId)}/language`,
				"POST",
				{
					action: "diagnostics",
					overlays: Object.fromEntries(
						documents.map((document) => [document.path, document.content]),
					),
				},
			)
				.then((result) => {
					if (!cancelled) setDiagnostics(result);
				})
				.catch((failure) => {
					if (!cancelled)
						setError(`TypeScript language service：${String(failure)}`);
				});
		}, 650);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [projectId, documents, snapshot]);

	const start = (
		mode: LabExecutionModeEnum,
		entries = [entry],
		runParameters = parameters,
	) =>
		execute(async () => {
			if (!projectId || !entries.length || entries.some((value) => !value))
				throw new Error("Select a loadable TypeScript case first.");
			const expectedRevisions = await flush();
			const parsed = JSON.parse(runParameters);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
				throw new Error("Run parameters must be a JSON object.");
			const report = await platformRequest<PlatformRun>(
				`${projectPath(projectId)}/runs`,
				"POST",
				{
					entries,
					mode,
					parameters: parsed,
					expectedRevisions,
				},
			);
			setSelectedRunId(report.id);
			setSelectedRun(report);
			setActiveRun(report);
			setCompactView(CompactPaneEnum.execution);
			setSnapshot(false);
			if (snapshot)
				navigate(
					{ path: report.entries[0] ?? report.snapshot.entry },
					false,
					true,
				);
			setStepId(undefined);
		});

	const control = (action: string) =>
		execute(async () => {
			if (!run) return;
			const report = await platformRequest<PlatformRun>(
				`${runPath(run.projectId, run.id)}/control`,
				"POST",
				{ action },
			);
			setSelectedRun(report);
			if (report.active) setActiveRun(report);
			else setActiveRun(undefined);
		});

	const chooseProject = (id: string) =>
		execute(async () => {
			if (id === projectId) return;
			await flush();
			setProjectId(id);
		});

	const openProject = () =>
		execute(async () => {
			if (projectId) await flush();
			const opened = await platformRequest<PlatformProjectSummary>(
				"/projects",
				"POST",
				{ rootPath: rootInput },
			);
			setProjects((current) => [
				...current.filter((candidate) => candidate.id !== opened.id),
				opened,
			]);
			setProjectId(opened.id);
			setCompactView(CompactPaneEnum.source);
			setRootInput("");
		});

	const createFile = () =>
		execute(async () => {
			if (!projectId || !newFile.trim()) return;
			const path = newFile.trim();
			const result = await platformRequest<PlatformSaveResult>(
				filePath(projectId, path),
				"PUT",
				{
					content: path.endsWith(".case.ts") ? CASE_TEMPLATE : "",
					expectedRevision: null,
				},
			);
			if (!result.saved) throw new Error(`File already exists: ${path}`);
			await refresh();
			navigate({ path });
			setSnapshot(false);
			if (path.endsWith(".case.ts")) setEntry(path);
			setNewFile("");
		});

	const selectHistory = (id: string) =>
		execute(async () => {
			if (!projectId) return;
			const report = await platformRequest<PlatformRun>(runPath(projectId, id));
			setSelectedRunId(id);
			setSelectedRun(report);
			setSnapshot(true);
			setInspectorOpen(true);
			setEvidenceOpen(true);
			setStepId(undefined);
			navigate(
				{ path: report.entries[0] ?? report.snapshot.entry },
				true,
				false,
			);
		});

	const rerun = () =>
		execute(async () => {
			if (!run || !projectId) return;
			const expectedRevisions = await flush();
			if (activeRun) {
				await platformRequest(
					`${runPath(projectId, activeRun.id)}/control`,
					"POST",
					{ action: "stop" },
				);
				const deadline = Date.now() + Math.max(15_000, limits.stopGraceMs * 5);
				let previous = activeRun;
				while (previous.active && Date.now() < deadline) {
					await new Promise((resolve) => setTimeout(resolve, 150));
					previous = await platformRequest<PlatformRun>(
						runPath(projectId, activeRun.id),
					);
					setSelectedRun(previous);
				}
				if (previous.active)
					throw new Error(
						"Previous execution has not confirmed termination. A replacement was not started.",
					);
			}
			const report = await platformRequest<PlatformRun>(
				`${projectPath(projectId)}/runs`,
				"POST",
				{
					entries: run.entries,
					mode: run.mode,
					parameters: run.snapshot.parameters,
					expectedRevisions,
				},
			);
			setSelectedRun(report);
			setSelectedRunId(report.id);
			setActiveRun(report);
			setSnapshot(false);
			if (snapshot)
				navigate(
					{ path: report.entries[0] ?? report.snapshot.entry },
					false,
					true,
				);
			setStepId(undefined);
		});

	const revealExplorer = () => {
		setSidebarOpen(true);
		setActivity(ActivityViewEnum.explorer);
		setCompactView(CompactPaneEnum.project);
		requestAnimationFrame(() =>
			shell.current
				?.querySelector<HTMLInputElement>('[aria-label="Local project path"]')
				?.focus(),
		);
	};

	return (
		<div
			ref={shell}
			className="platform-shell"
			data-compact-view={compactView}
			data-theme={resolvedTheme}
			data-inspector-open={inspectorOpen}
			data-evidence-open={evidenceOpen}
			data-sidebar-open={sidebarOpen}
		>
			<header className="platform-header titlebar-container has-center">
				<div className="titlebar-left" aria-hidden="true" />
				<div className="titlebar-center">
					<div className="window-title command-center">
						<button
							type="button"
							className="titlebar-action"
							aria-label="Previous open source"
							title="Previous open file"
							disabled={activeTabIndex <= 0}
							onClick={() =>
								navigate({ path: visibleOpenFiles[activeTabIndex - 1] })
							}
						>
							<span
								className="titlebar-icon icon-arrow-left"
								aria-hidden="true"
							/>
						</button>
						<button
							type="button"
							className="titlebar-action"
							aria-label="Next open source"
							title="Next open file"
							disabled={
								activeTabIndex < 0 ||
								activeTabIndex >= visibleOpenFiles.length - 1
							}
							onClick={() =>
								navigate({ path: visibleOpenFiles[activeTabIndex + 1] })
							}
						>
							<span
								className="titlebar-icon icon-arrow-right"
								aria-hidden="true"
							/>
						</button>
						<div className="titlebar-project-center">
							<button
								type="button"
								className="titlebar-project-input"
								aria-label="Open project explorer"
								title={selectedProject?.rootPath ?? "Open Project"}
								onClick={revealExplorer}
							>
								<span className="titlebar-project-name">
									{selectedProject?.rootPath
										.split("/")
										.filter(Boolean)
										.at(-1) ?? "Remote Lab"}
								</span>
							</button>
							<span
								className="titlebar-file-count"
								role="img"
								aria-label={`${treeFiles.length} project files`}
								title={`${treeFiles.length} project files`}
							>
								<span
									className="titlebar-icon icon-circle-filled"
									aria-hidden="true"
								/>
								<span>{treeFiles.length}</span>
							</span>
							<div className="titlebar-theme" title="Workbench Theme">
								<span
									className="titlebar-icon icon-color-mode"
									aria-hidden="true"
								/>
								<span
									className="titlebar-icon icon-chevron-down"
									aria-hidden="true"
								/>
								<select
									aria-label="Workbench theme"
									value={theme}
									onChange={(event) =>
										setTheme(event.target.value as PlatformThemeEnum)
									}
								>
									<option value={PlatformThemeEnum.system}>
										Follow System
									</option>
									<option value={PlatformThemeEnum.light}>Light</option>
									<option value={PlatformThemeEnum.dark}>Dark</option>
								</select>
							</div>
						</div>
					</div>
				</div>
				<div className="titlebar-right">
					<div className="platform-header-actions action-toolbar-container">
						<button
							type="button"
							aria-label="Focus editor"
							title="Back to Editing"
							onClick={() => {
								setInspectorOpen(false);
								setEvidenceOpen(false);
								setCompactView(CompactPaneEnum.source);
								requestAnimationFrame(() =>
									shell.current
										?.querySelector<HTMLTextAreaElement>(
											".platform-editor textarea",
										)
										?.focus(),
								);
							}}
						>
							<span className="titlebar-icon icon-layout" aria-hidden="true" />
						</button>
						<button
							type="button"
							aria-label="Toggle project sidebar"
							title="Toggle Primary Sidebar"
							aria-controls="project-tree"
							aria-expanded={sidebarVisible}
							onClick={() => {
								setSidebarOpen(!sidebarVisible);
								setCompactView(
									sidebarVisible
										? CompactPaneEnum.source
										: CompactPaneEnum.project,
								);
							}}
						>
							<span
								className="titlebar-icon icon-layout-sidebar-left"
								aria-hidden="true"
							/>
						</button>
						<button
							type="button"
							aria-label="Toggle observation panel"
							title="Observation Panel"
							aria-controls="run-evidence"
							aria-expanded={evidenceVisible}
							onClick={() => {
								setEvidenceOpen(!evidenceVisible);
								setCompactView(
									evidenceVisible
										? CompactPaneEnum.source
										: CompactPaneEnum.evidence,
								);
							}}
						>
							<span
								className="titlebar-icon icon-layout-panel"
								aria-hidden="true"
							/>
						</button>
						<button
							type="button"
							aria-label="Toggle run inspector"
							title="Run Inspector"
							aria-controls="execution-inspector"
							aria-expanded={inspectorVisible}
							onClick={() => {
								setInspectorOpen(!inspectorVisible);
								setCompactView(
									inspectorVisible
										? CompactPaneEnum.source
										: CompactPaneEnum.execution,
								);
							}}
						>
							<span
								className="titlebar-icon icon-layout-sidebar-right"
								aria-hidden="true"
							/>
						</button>
					</div>
				</div>
			</header>
			{error || fileError ? (
				<div className="platform-banner platform-error" role="alert">
					<span>{error ?? fileError}</span>
					<button
						type="button"
						onClick={() => setError(undefined)}
						aria-label="Dismiss error"
					>
						×
					</button>
				</div>
			) : null}
			<nav className="platform-compact-navigation" aria-label="Workbench panes">
				{Object.values(CompactPaneEnum).map((pane) => (
					<button
						type="button"
						key={pane}
						aria-pressed={compactView === pane}
						onClick={() => {
							setCompactView(pane);
							if (pane === CompactPaneEnum.project) setSidebarOpen(true);
							if (pane === CompactPaneEnum.execution) setInspectorOpen(true);
							if (pane === CompactPaneEnum.evidence) setEvidenceOpen(true);
						}}
					>
						{COMPACT_PANE_LABELS[pane]}
					</button>
				))}
			</nav>
			<main className="platform-main">
				<nav
					className="platform-activity-bar"
					aria-label="Workbench activities"
				>
					{ACTIVITY_VIEWS.map(({ value, label, name, icon: Icon }) => (
						<button
							type="button"
							key={value}
							aria-label={name}
							title={label}
							aria-controls="project-tree"
							aria-pressed={activity === value}
							onClick={() => {
								setActivity(value);
								setSidebarOpen(true);
								setCompactView(CompactPaneEnum.project);
							}}
						>
							<Icon size={24} aria-hidden="true" />
						</button>
					))}
				</nav>
				<SplitView
					direction={SplitViewDirectionEnum.horizontal}
					separatorLabel="Resize project sidebar"
				>
					<SplitViewPane
						visible={sidebarVisible}
						id="project-tree"
						defaultSize={22}
						minSize={14}
					>
						<aside
							className="platform-sidebar platform-scroll"
							aria-label="Project and case tree"
						>
							<div className="platform-panel-title">
								<h2>
									{
										ACTIVITY_VIEWS.find((view) => view.value === activity)
											?.label
									}
								</h2>
								<span>REMOTE LAB</span>
							</div>
							<section
								hidden={activity !== ActivityViewEnum.explorer}
								aria-label="Explorer sidebar"
							>
								<form
									className="platform-project-form"
									onSubmit={(event) => {
										event.preventDefault();
										void openProject();
									}}
								>
									<input
										aria-label="Local project path"
										placeholder="/absolute/local/project"
										value={rootInput}
										onChange={(event) => setRootInput(event.target.value)}
									/>
									<button type="submit" disabled={pending || !rootInput.trim()}>
										Open Local Project
									</button>
								</form>
								<nav aria-label="Opened projects">
									{projects.map((candidate) => (
										<button
											type="button"
											className={`platform-project-item ${candidate.id === projectId ? "selected" : ""}`}
											key={candidate.id}
											title={candidate.rootPath}
											onClick={() => void chooseProject(candidate.id)}
										>
											<span className="platform-file-label">
												<MaterialFolderIcon open={candidate.id === projectId} />
												{candidate.builtin ? "Built-in Case" : "Local Project"}
											</span>
											<small>
												{candidate.rootPath.split("/").filter(Boolean).at(-1)}
											</small>
										</button>
									))}
								</nav>
								{projectReady && project ? (
									<>
										<div className="platform-section-title">
											<h3>{snapshot ? "Snapshot File (read-only)" : "File"}</h3>
											<span>{treeFiles.length}</span>
										</div>
										<nav aria-label="Project files">
											{treeFiles.map((file) => (
												<button
													type="button"
													aria-pressed={activePath === file.path}
													key={file.path}
													className="platform-tree-file"
													onClick={() => {
														navigate({ path: file.path });
													}}
													title={file.path}
												>
													<span className="platform-file-label">
														<MaterialFileIcon path={file.path} />
														<span className="platform-file-name">
															{file.path}
														</span>
													</span>
													<span
														className="platform-file-status"
														aria-hidden="true"
													>
														{snapshot ||
														documents.find(
															(document) => document.path === file.path,
														)?.status === DocumentSaveStatusEnum.saved
															? ""
															: "●"}
													</span>
												</button>
											))}
										</nav>
										<form
											className="platform-project-form"
											onSubmit={(event) => {
												event.preventDefault();
												void createFile();
											}}
										>
											<input
												aria-label="New file path"
												placeholder="example.case.ts or src/helper.ts"
												value={newFile}
												onChange={(event) => setNewFile(event.target.value)}
											/>
											<button
												type="submit"
												disabled={pending || !newFile.trim()}
											>
												New File / Case
											</button>
										</form>
									</>
								) : (
									<p className="platform-empty">
										Open a local directory and load .case.ts cases.
									</p>
								)}
							</section>
							<section
								hidden={activity !== ActivityViewEnum.testing}
								aria-label="Testing sidebar"
							>
								<div className="platform-section-title">
									<h3>Cases</h3>
									<span>{cases.length}</span>
								</div>
								<div className="platform-case-list">
									{cases.map((file) => (
										<button
											type="button"
											key={file.path}
											data-testid="case-entry"
											title={file.path}
											aria-pressed={entry === file.path}
											className={entry === file.path ? "selected" : ""}
											onClick={() => {
												setEntry(file.path);
												setSnapshot(false);
												navigate({ path: file.path });
											}}
										>
											<span className="platform-file-label">
												<MaterialFileIcon path={file.path} />
												<span className="platform-file-name">{file.path}</span>
											</span>
										</button>
									))}
								</div>
								<details className="platform-parameters">
									<summary>Run Parameters · JSON</summary>
									<textarea
										aria-label="Run parameters JSON"
										value={parameters}
										onChange={(event) => setParameters(event.target.value)}
										spellCheck={false}
									/>
								</details>
								{!cases.length ? (
									<p className="platform-empty">
										No test cases yet. Create a .case.ts file in Explorer.
									</p>
								) : null}
							</section>
							<section
								hidden={activity !== ActivityViewEnum.history}
								aria-label="History sidebar"
							>
								{projectReady && project ? (
									<>
										<div className="platform-section-title">
											<h3>Persistent History</h3>
											<span>{runs.length}</span>
										</div>
										<p className="platform-note">
											Up to {project.historyLimits.count} runs /{" "}
											{Math.round(project.historyLimits.bytes / 1024 / 1024)}{" "}
											MiB
										</p>
										{activeRun ? (
											<button
												type="button"
												className="platform-history-item"
												onClick={() => {
													setSelectedRunId(activeRun.id);
													setSelectedRun(activeRun);
													setSnapshot(false);
													if (snapshot) navigate({ path: entry }, false, true);
													setStepId(undefined);
												}}
											>
												● Active Run <small>{activeRun.state}</small>
											</button>
										) : null}
										{runs.map((history) => (
											<div className="platform-history-row" key={history.id}>
												<button
													type="button"
													className={`platform-history-item ${run?.id === history.id ? "selected" : ""}`}
													onClick={() => void selectHistory(history.id)}
												>
													<span>
														{history.entries?.[0]?.split("/").at(-1) ??
															history.id.slice(0, 8)}
													</span>
													<small>
														{history.result ?? "record"} ·{" "}
														{new Date(history.createdAt).toLocaleTimeString()}
													</small>
												</button>
												<button
													type="button"
													aria-label={`Delete history ${history.id}`}
													disabled={history.active || pending}
													onClick={() =>
														void execute(async () => {
															await platformRequest(
																runPath(history.projectId, history.id),
																"DELETE",
															);
															setRuns((current) =>
																current.filter(
																	(item) => item.id !== history.id,
																),
															);
															if (run?.id === history.id) {
																setSelectedRun(undefined);
																setSelectedRunId(undefined);
																setSnapshot(false);
																if (snapshot)
																	navigate({ path: entry }, false, true);
															}
														})
													}
												>
													×
												</button>
											</div>
										))}
										{!runs.length && !activeRun ? (
											<p className="platform-empty">
												No run history yet. Run tests to retain results and
												source snapshots here.
											</p>
										) : null}
									</>
								) : (
									<p className="platform-empty">
										Open a project first to view history.
									</p>
								)}
							</section>
						</aside>
					</SplitViewPane>
					<SplitViewPane
						id="editor-and-observation"
						visible={!compactScreen || compactView !== CompactPaneEnum.project}
						defaultSize={78}
						minSize={50}
					>
						<SplitView
							direction={SplitViewDirectionEnum.vertical}
							separatorLabel="Resize data flow panel"
						>
							<SplitViewPane
								id="editor-and-execution"
								visible={
									!compactScreen || compactView !== CompactPaneEnum.evidence
								}
								defaultSize={69}
								minSize={35}
							>
								<SplitView
									direction={SplitViewDirectionEnum.horizontal}
									separatorLabel="Resize execution panel"
								>
									<SplitViewPane
										id="source-editor"
										visible={
											!compactScreen || compactView === CompactPaneEnum.source
										}
										defaultSize={68}
										minSize={35}
									>
										<section
											className="platform-source"
											aria-label="Project source editor"
										>
											<div className="platform-run-toolbar">
												<select
													aria-label="Selected TypeScript case"
													value={entry}
													onChange={(event) => {
														setEntry(event.target.value);
														setSnapshot(false);
														navigate({ path: event.target.value });
													}}
												>
													<option value="">Select Case</option>
													{cases.map((file) => (
														<option value={file.path} key={file.path}>
															{file.path}
														</option>
													))}
												</select>
												<button
													type="button"
													className="platform-primary"
													disabled={pending || !entry || Boolean(activeRun)}
													onClick={() => void start(LabExecutionModeEnum.test)}
												>
													<Play size={14} aria-hidden="true" />
													Run Test
												</button>
												<button
													type="button"
													disabled={pending || !entry || Boolean(activeRun)}
													onClick={() => void start(LabExecutionModeEnum.debug)}
												>
													<FlaskConical size={14} aria-hidden="true" />
													Step Debug
												</button>
												<button
													type="button"
													disabled={
														pending || !cases.length || Boolean(activeRun)
													}
													onClick={() =>
														void start(
															LabExecutionModeEnum.test,
															cases.map((file) => file.path),
														)
													}
												>
													Test All
												</button>
											</div>

											<div
												className={`platform-source-context ${snapshot ? "historical" : ""}`}
											>
												<span>
													{snapshot
														? `Read-only source snapshot · ${run?.snapshot.id} · Run ${run?.id.slice(0, 8)}`
														: `Current editable source · ${selectedProject?.rootPath ?? "No project"}${run ? ` · Observing run ${run.id.slice(0, 8)}（execution version is in snapshot)` : ""}`}
												</span>
												{run ? (
													<button
														type="button"
														onClick={() => {
															setSnapshot(!snapshot);
															navigate(
																{
																	path: snapshot
																		? entry
																		: (run.entries[0] ?? run.snapshot.entry),
																},
																true,
																snapshot,
															);
														}}
													>
														{snapshot
															? "Back to Current Source"
															: "View Execution Snapshot"}
													</button>
												) : null}
											</div>
											<div
												className="platform-editor-tabs"
												role="tablist"
												aria-label="Open source files"
											>
												{visibleOpenFiles.map((path) => (
													<EditorTab
														key={path}
														path={path}
														active={activePath === path}
														onActivate={() => activatePath(path)}
														onClose={() => {
															const next = openFiles.filter(
																(open) => open !== path,
															);
															setOpenFiles(next);
															if (activePath === path)
																activatePath(next.at(-1));
														}}
													/>
												))}
												<div
													className="platform-editor-tab-spacer"
													aria-hidden="true"
												/>
											</div>
											{conflict ? (
												<div className="platform-conflict" role="alert">
													<strong>IDE edit conflict：{conflict.path}</strong>
													<p>
														The editor kept your draft. The disk version is
														below; finish merging in the draft and save
														explicitly.
													</p>
													<details open>
														<summary>
															Disk version (both sides retained)
														</summary>
														<pre data-testid="disk-conflict-content">
															{conflict.conflict?.content ||
																"(empty / removed)"}
														</pre>
													</details>
													{conflict.preservedConflict ? (
														<details open>
															<summary>
																Save IDE version retained during conflict ·{" "}
																{conflict.preservedConflict.path}
															</summary>
															<pre>{conflict.preservedConflict.content}</pre>
														</details>
													) : null}
													<div>
														<button
															type="button"
															disabled={pending}
															onClick={() =>
																void execute(() =>
																	resolveConflict(conflict.path, false),
																)
															}
														>
															Keep Editor Content and Save
														</button>
														<button
															type="button"
															disabled={pending}
															onClick={() =>
																void execute(() =>
																	resolveConflict(conflict.path, true),
																)
															}
														>
															Use Disk Version
														</button>
													</div>
												</div>
											) : null}
											{projectId ? (
												<Suspense
													fallback={
														<div className="platform-empty">
															Loading Monaco editor...
														</div>
													}
												>
													<ProjectEditor
														key={projectId}
														projectId={projectId}
														theme={resolvedTheme}
														documents={viewDocuments}
														activePath={activePath}
														snapshotId={snapshot ? run?.snapshot.id : undefined}
														diagnostics={diagnostics}
														location={location}
														onEdit={edit}
														onNavigate={navigate}
														onError={setError}
														onReadSource={(source) =>
															setNavigationFiles((current) => [
																...current.filter(
																	(file) => file.path !== source.path,
																),
																{ ...source, readOnly: true },
															])
														}
													/>
												</Suspense>
											) : (
												<div className="platform-empty">Remote Lab</div>
											)}
											<div className="platform-editor-status">
												<span data-testid="save-status">
													{dirty.length
														? `${dirty.length}  files: ${dirty.map((document) => document.status).join(", ")}`
														: "All saved"}
												</span>
												{dirty.length ? (
													<button
														type="button"
														onClick={() => void execute(flush)}
													>
														Retry Save All
													</button>
												) : null}
												<button
													type="button"
													onClick={() => setShowDiagnostics(!showDiagnostics)}
												>
													TypeScript Diagnostics {diagnostics.length}
												</button>
											</div>
											{dirty.some((document) => document.error) ? (
												<div className="platform-warning" role="status">
													{dirty
														.filter((document) => document.error)
														.map((document) => (
															<div key={document.path}>
																{document.path}: {document.error}
																<button
																	type="button"
																	onClick={() =>
																		void execute(() => save(document.path))
																	}
																>
																	Retry
																</button>
															</div>
														))}
												</div>
											) : null}
											{showDiagnostics && !snapshot ? (
												<section
													className="platform-diagnostics platform-scroll"
													aria-label="Project TypeScript diagnostics"
												>
													{diagnostics.length ? (
														diagnostics.map((diagnostic) => (
															<button
																type="button"
																key={`${diagnostic.path}:${diagnostic.start}:${diagnostic.code}:${diagnostic.message}`}
																onClick={() => navigate(diagnostic)}
															>
																{diagnostic.path} · TS{diagnostic.code} ·{" "}
																{diagnostic.message}
															</button>
														))
													) : (
														<p>
															Project TypeScript Check has no diagnostics. Test
															verification is determined by actual assertions.
														</p>
													)}
												</section>
											) : null}
										</section>
									</SplitViewPane>
									<SplitViewPane
										id="execution-inspector"
										visible={inspectorVisible}
										defaultSize={32}
										minSize={23}
									>
										<RunInspector
											run={run}
											stepId={stepId}
											pending={pending}
											onSelectStep={setStepId}
											onNavigate={(target) => {
												setSnapshot(true);
												navigate(target, true, false);
											}}
											onControl={(action) => void control(action)}
											onRerun={() => void rerun()}
										/>
									</SplitViewPane>
								</SplitView>
							</SplitViewPane>
							<SplitViewPane
								visible={evidenceVisible}
								id="run-evidence"
								defaultSize={31}
								minSize={15}
							>
								<RunEvidence
									key={run?.id ?? "empty"}
									run={run}
									stepId={stepId}
									onSelectStep={setStepId}
								/>
							</SplitViewPane>
						</SplitView>
					</SplitViewPane>
				</SplitView>
			</main>
			<footer className="platform-footer">
				<button
					type="button"
					className="platform-run-status"
					data-testid="workbench-run-status"
					title={
						run
							? `Observing run ${run.id} · ${run.entries.join(", ")}`
							: "No run selected"
					}
					onClick={() => {
						setInspectorOpen(true);
						setCompactView(CompactPaneEnum.execution);
					}}
				>
					<Play size={12} aria-hidden="true" />
					{run
						? `${run.id.slice(0, 8)} · ${run.state} · ${run.result}`
						: "Ready · no run selected"}
				</button>
				{activeRun && activeRun.id !== run?.id ? (
					<button
						type="button"
						className="platform-run-status"
						aria-label="Observe active run"
						title={activeRun.id}
						onClick={() => {
							setSelectedRunId(activeRun.id);
							setSelectedRun(activeRun);
							setStepId(undefined);
							setSnapshot(false);
							if (snapshot) navigate({ path: entry }, false, true);
							setInspectorOpen(true);
							setEvidenceOpen(true);
							setCompactView(CompactPaneEnum.execution);
						}}
					>
						Active {activeRun.id.slice(0, 8)} · {activeRun.state}
					</button>
				) : null}

				<span>
					Automatic tests continue after closing pages · page-less debug
					retained for {limits.debugRetentionMs / 1000}s + heartbeat lease at
					most {limits.heartbeatLeaseMs / 1000}s · stop grace{" "}
					{limits.stopGraceMs / 1000}s
				</span>
			</footer>
		</div>
	);
}

const ProjectEditor = lazy(() =>
	import("./project-editor").then((module) => ({
		default: module.ProjectEditor,
	})),
);

enum ActivityViewEnum {
	explorer = "explorer",
	testing = "testing",
	history = "history",
}

const ACTIVITY_VIEWS = [
	{
		value: ActivityViewEnum.explorer,
		label: "Explorer",
		name: "Explorer",
		icon: Files,
	},
	{
		value: ActivityViewEnum.testing,
		label: "Testing",
		name: "Testing",
		icon: FlaskConical,
	},
	{
		value: ActivityViewEnum.history,
		label: "History",
		name: "History",
		icon: History,
	},
];

enum CompactPaneEnum {
	project = "project",
	source = "source",
	execution = "execution",
	evidence = "evidence",
}

const COMPACT_PANE_LABELS = {
	[CompactPaneEnum.project]: "Project / Cases",
	[CompactPaneEnum.source]: "Code",
	[CompactPaneEnum.execution]: "Execution / Assertions",
	[CompactPaneEnum.evidence]: "Data Flow / Logs",
};

const CASE_TEMPLATE = `import type { ILabCase } from "@husky-di/example-remote-lab/sdk";

export const labCase: ILabCase = {
  title: "My test case",
  async run(ctx) {
    await ctx.step("Observe behavior", async () => {
      ctx.log("Add your Remote service operations here");
      // Add ctx.assert(condition, "Expected behavior") to verify the result.
    });
  },
};
`;
