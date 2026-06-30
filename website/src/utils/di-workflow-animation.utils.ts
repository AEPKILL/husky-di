/**
 * @overview ASCII frame helpers for the dependency injection workflow
 * animation used on the website homepage.
 * @author AEPKILL
 * @created 2026-06-30 10:57:00
 */

const GRID_COLUMNS = 49;
const GRID_ROWS = 18;
const INJECTOR_CENTER_COLUMN = 24;
const SOURCE_COLUMNS = [8, 24, 40] as const;
const SOURCE_LEFT_COLUMNS = [4, 20, 36] as const;
const SLOT_COLUMNS = [20, 24, 28] as const;
const DEPENDENCY_NAMES = ["A", "B", "C"] as const;
const TOKEN_TRAIL = ["O", "o", ":", "."] as const;
const TOKEN_TRAVEL_TICKS = 18;
const READY_HOLD_TICKS = TOKEN_TRAVEL_TICKS * 4;
const READY_LABEL = "all satisfied -> run()";
const READY_BLINK_PHASE_TICKS = 2;
const READY_BLINK_VISIBILITY = [
	true,
	false,
	true,
	false,
	true,
	false,
	true,
	false,
	true,
	false,
	true,
] as const;
const TOTAL_CYCLE_TICKS =
	TOKEN_TRAVEL_TICKS * DEPENDENCY_NAMES.length + READY_HOLD_TICKS;

type Point = readonly [row: number, column: number];
type Grid = string[][];

export type DiWorkflowAnimationFrame = {
	ascii: string;
	isLabelVisible: boolean;
	label: string;
};

const INJECTION_PATHS = SOURCE_COLUMNS.map((sourceColumn, index) =>
	buildInjectionPath(sourceColumn, SLOT_COLUMNS[index]),
);

export function getDiWorkflowAnimationFrame(
	tick: number,
): DiWorkflowAnimationFrame {
	const grid = createBlankGrid();
	const cycleTick =
		((tick % TOTAL_CYCLE_TICKS) + TOTAL_CYCLE_TICKS) % TOTAL_CYCLE_TICKS;
	const completedDependencyCount = Math.min(
		DEPENDENCY_NAMES.length,
		Math.floor(cycleTick / TOKEN_TRAVEL_TICKS),
	);
	const isReady = cycleTick >= TOKEN_TRAVEL_TICKS * DEPENDENCY_NAMES.length;

	drawSourceBoxes(grid);
	drawInjector(grid);
	drawPipeSkeleton(grid, tick);
	drawConsumer(grid, completedDependencyCount);

	const isLabelVisible = isReady
		? getReadyLabelVisibility(
				cycleTick - TOKEN_TRAVEL_TICKS * DEPENDENCY_NAMES.length,
			)
		: true;
	const label = isReady
		? READY_LABEL
		: drawActiveDependencyToken(grid, cycleTick, completedDependencyCount);

	return {
		ascii: convertGridToString(grid),
		isLabelVisible,
		label,
	};
}

function createBlankGrid(): Grid {
	return Array.from({ length: GRID_ROWS }, () =>
		Array.from({ length: GRID_COLUMNS }, () => " "),
	);
}

function writeText(
	grid: Grid,
	row: number,
	column: number,
	text: string,
): void {
	for (let offset = 0; offset < text.length; offset += 1) {
		const targetColumn = column + offset;

		if (
			row >= 0 &&
			row < GRID_ROWS &&
			targetColumn >= 0 &&
			targetColumn < GRID_COLUMNS
		) {
			grid[row][targetColumn] = text[offset];
		}
	}
}

function buildInjectionPath(sourceColumn: number, slotColumn: number): Point[] {
	const path: Point[] = [];

	for (let row = 4; row <= 6; row += 1) {
		path.push([row, sourceColumn]);
	}

	if (sourceColumn < INJECTOR_CENTER_COLUMN) {
		for (
			let column = sourceColumn + 1;
			column <= INJECTOR_CENTER_COLUMN;
			column += 1
		) {
			path.push([7, column]);
		}
	} else if (sourceColumn > INJECTOR_CENTER_COLUMN) {
		for (
			let column = sourceColumn - 1;
			column >= INJECTOR_CENTER_COLUMN;
			column -= 1
		) {
			path.push([7, column]);
		}
	} else {
		path.push([7, INJECTOR_CENTER_COLUMN]);
	}

	for (let row = 8; row <= 12; row += 1) {
		path.push([row, INJECTOR_CENTER_COLUMN]);
	}

	path.push([13, INJECTOR_CENTER_COLUMN]);
	path.push([14, INJECTOR_CENTER_COLUMN]);

	if (slotColumn < INJECTOR_CENTER_COLUMN) {
		for (
			let column = INJECTOR_CENTER_COLUMN - 1;
			column >= slotColumn;
			column -= 1
		) {
			path.push([14, column]);
		}
	} else if (slotColumn > INJECTOR_CENTER_COLUMN) {
		for (
			let column = INJECTOR_CENTER_COLUMN + 1;
			column <= slotColumn;
			column += 1
		) {
			path.push([14, column]);
		}
	}

	path.push([15, slotColumn]);

	return path;
}

function drawSourceBoxes(grid: Grid): void {
	SOURCE_LEFT_COLUMNS.forEach((leftColumn, index) => {
		writeText(grid, 1, leftColumn, "+-------+");
		writeText(grid, 2, leftColumn, `| SRC ${DEPENDENCY_NAMES[index]} |`);
		writeText(grid, 3, leftColumn, "+-------+");
	});
}

function drawInjector(grid: Grid): void {
	writeText(grid, 9, 16, "+---------------+");
	writeText(grid, 10, 16, "|   INJECTOR    |");
	writeText(grid, 11, 16, "+---------------+");
}

function drawPipeSkeleton(grid: Grid, tick: number): void {
	SOURCE_COLUMNS.forEach((sourceColumn) => {
		for (let row = 4; row <= 6; row += 1) {
			grid[row][sourceColumn] = (row + tick) % 3 === 0 ? ":" : ".";
		}
	});

	for (
		let column = SOURCE_COLUMNS[0];
		column <= SOURCE_COLUMNS[2];
		column += 1
	) {
		grid[7][column] = "-";
	}

	SOURCE_COLUMNS.forEach((sourceColumn) => {
		grid[7][sourceColumn] = "+";
	});

	grid[8][INJECTOR_CENTER_COLUMN] = (8 + tick) % 3 === 0 ? ":" : ".";
	grid[12][INJECTOR_CENTER_COLUMN] = (12 + tick) % 3 === 0 ? ":" : ".";
}

function drawConsumer(grid: Grid, completedDependencyCount: number): void {
	const slots = SLOT_COLUMNS.map((_, index) =>
		index < completedDependencyCount ? "[#]" : "[ ]",
	).join(" ");

	writeText(grid, 13, 14, "+-------------------+");
	writeText(grid, 14, 14, "|     CONSUMER      |");
	writeText(grid, 15, 14, `|    ${slots}    |`);
	writeText(grid, 16, 14, "+-------------------+");
}

function drawActiveDependencyToken(
	grid: Grid,
	cycleTick: number,
	completedDependencyCount: number,
): string {
	const dependencyIndex = completedDependencyCount;
	const localTick = cycleTick - dependencyIndex * TOKEN_TRAVEL_TICKS;
	const path = INJECTION_PATHS[dependencyIndex];
	const pathIndex = Math.round(
		(localTick / (TOKEN_TRAVEL_TICKS - 1)) * (path.length - 1),
	);

	TOKEN_TRAIL.forEach((trailCharacter, offset) => {
		const point = path[pathIndex - offset];

		if (point) {
			grid[point[0]][point[1]] = trailCharacter;
		}
	});

	return `injecting dep ${DEPENDENCY_NAMES[dependencyIndex]}  >>>`;
}

function getReadyLabelVisibility(readyTick: number): boolean {
	const phaseIndex = Math.min(
		Math.floor(readyTick / READY_BLINK_PHASE_TICKS),
		READY_BLINK_VISIBILITY.length - 1,
	);

	return READY_BLINK_VISIBILITY[phaseIndex];
}

function convertGridToString(grid: Grid): string {
	return grid.map((row) => row.join("")).join("\n");
}
