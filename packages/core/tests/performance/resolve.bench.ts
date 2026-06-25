/**
 * @overview Local benchmarks for core resolve throughput across common scenarios.
 *
 * Each benchmark sample performs 1,000,000 resolve operations so the reported
 * mean time maps directly to a fixed local comparison batch.
 *
 * @author AEPKILL
 * @created 2026-06-25 15:58:49
 */

import { bench, describe } from "vitest";

import {
	createContainer,
	createServiceIdentifier,
	LifecycleEnum,
	resolve,
} from "../../src/index";

const RESOLVE_BATCH_SIZE = 1_000_000;

const BENCH_OPTIONS = {
	iterations: 3,
	time: 1,
	warmupIterations: 1,
	warmupTime: 1,
};

let _sink = 0;

type BenchResolver = () => number;
type BenchValue = {
	readonly value: number;
};

const IUseValueService = createServiceIdentifier<BenchValue>(
	"IUseValueBenchService",
);
const IFactoryService = createServiceIdentifier<BenchValue>(
	"IFactoryBenchService",
);
const IAliasTargetService = createServiceIdentifier<BenchValue>(
	"IAliasTargetBenchService",
);
const IAliasService = createServiceIdentifier<BenchValue>("IAliasBenchService");
const IParentValueService = createServiceIdentifier<BenchValue>(
	"IParentValueBenchService",
);
const IDepthOneService = createServiceIdentifier<DepthOneService>(
	"IDepthOneBenchService",
);
const IDepthThreeLeafService = createServiceIdentifier<DepthThreeLeafService>(
	"IDepthThreeLeafBenchService",
);
const IDepthThreeMiddleService =
	createServiceIdentifier<DepthThreeMiddleService>(
		"IDepthThreeMiddleBenchService",
	);
const IDepthThreeRootService = createServiceIdentifier<DepthThreeRootService>(
	"IDepthThreeRootBenchService",
);
const IDepthFiveLeafService = createServiceIdentifier<DepthFiveLeafService>(
	"IDepthFiveLeafBenchService",
);
const IDepthFiveLevel4Service = createServiceIdentifier<DepthFiveLevel4Service>(
	"IDepthFiveLevel4BenchService",
);
const IDepthFiveLevel3Service = createServiceIdentifier<DepthFiveLevel3Service>(
	"IDepthFiveLevel3BenchService",
);
const IDepthFiveLevel2Service = createServiceIdentifier<DepthFiveLevel2Service>(
	"IDepthFiveLevel2BenchService",
);
const IDepthFiveRootService = createServiceIdentifier<DepthFiveRootService>(
	"IDepthFiveRootBenchService",
);

class TransientBenchService {
	readonly value = 1;
}

class SingletonBenchService {
	readonly value = 1;
}

class DepthOneService {
	readonly value = 1;
}

class DepthThreeLeafService {
	readonly value = 1;
}

class DepthThreeMiddleService {
	readonly next = resolve(IDepthThreeLeafService);
	readonly value = this.next.value + 1;
}

class DepthThreeRootService {
	readonly next = resolve(IDepthThreeMiddleService);
	readonly value = this.next.value + 1;
}

class DepthFiveLeafService {
	readonly value = 1;
}

class DepthFiveLevel4Service {
	readonly next = resolve(IDepthFiveLeafService);
	readonly value = this.next.value + 1;
}

class DepthFiveLevel3Service {
	readonly next = resolve(IDepthFiveLevel4Service);
	readonly value = this.next.value + 1;
}

class DepthFiveLevel2Service {
	readonly next = resolve(IDepthFiveLevel3Service);
	readonly value = this.next.value + 1;
}

class DepthFiveRootService {
	readonly next = resolve(IDepthFiveLevel2Service);
	readonly value = this.next.value + 1;
}

function consume(value: number): void {
	_sink ^= value;
}

function runResolveBatch(resolveValue: BenchResolver): void {
	for (let index = 0; index < RESOLVE_BATCH_SIZE; index += 1) {
		consume(resolveValue());
	}
}

function createUseValueResolver(): BenchResolver {
	const container = createContainer("UseValueBenchContainer");
	container.register(IUseValueService, {
		useValue: {
			value: 1,
		},
	});

	return () => container.resolve(IUseValueService).value;
}

function createTransientResolver(): BenchResolver {
	const container = createContainer("TransientBenchContainer");
	container.register(TransientBenchService, {
		useClass: TransientBenchService,
		lifecycle: LifecycleEnum.transient,
	});

	return () => container.resolve(TransientBenchService).value;
}

function createSingletonResolver(): BenchResolver {
	const container = createContainer("SingletonBenchContainer");
	container.register(SingletonBenchService, {
		useClass: SingletonBenchService,
		lifecycle: LifecycleEnum.singleton,
	});

	return () => container.resolve(SingletonBenchService).value;
}

function createFactoryResolver(): BenchResolver {
	const container = createContainer("FactoryBenchContainer");
	container.register(IFactoryService, {
		useFactory: () => ({
			value: 1,
		}),
		lifecycle: LifecycleEnum.transient,
	});

	return () => container.resolve(IFactoryService).value;
}

function createAliasResolver(): BenchResolver {
	const container = createContainer("AliasBenchContainer");
	container.register(IAliasTargetService, {
		useValue: {
			value: 1,
		},
	});
	container.register(IAliasService, {
		useAlias: IAliasTargetService,
	});

	return () => container.resolve(IAliasService).value;
}

function createParentChildResolver(): BenchResolver {
	const parent = createContainer("ParentBenchContainer");
	const child = createContainer("ChildBenchContainer", parent);

	parent.register(IParentValueService, {
		useValue: {
			value: 1,
		},
	});

	return () => child.resolve(IParentValueService).value;
}

function createMiddlewareResolver(middlewareCount: number): BenchResolver {
	const container = createContainer(
		`MiddlewareBenchContainer${middlewareCount}`,
	);
	container.register(IUseValueService, {
		useValue: {
			value: 1,
		},
	});

	for (let index = 0; index < middlewareCount; index += 1) {
		container.use({
			name: `middleware-bench-${middlewareCount}-${index}`,
			executor: (params, next) => next(params),
		});
	}

	return () => container.resolve(IUseValueService).value;
}

function createDepthOneResolver(): BenchResolver {
	const container = createContainer("DepthOneBenchContainer");
	container.register(IDepthOneService, {
		useClass: DepthOneService,
		lifecycle: LifecycleEnum.transient,
	});

	return () => container.resolve(IDepthOneService).value;
}

function createDepthThreeResolver(): BenchResolver {
	const container = createContainer("DepthThreeBenchContainer");
	container.register(IDepthThreeLeafService, {
		useClass: DepthThreeLeafService,
		lifecycle: LifecycleEnum.transient,
	});
	container.register(IDepthThreeMiddleService, {
		useClass: DepthThreeMiddleService,
		lifecycle: LifecycleEnum.transient,
	});
	container.register(IDepthThreeRootService, {
		useClass: DepthThreeRootService,
		lifecycle: LifecycleEnum.transient,
	});

	return () => container.resolve(IDepthThreeRootService).value;
}

function createDepthFiveResolver(): BenchResolver {
	const container = createContainer("DepthFiveBenchContainer");
	container.register(IDepthFiveLeafService, {
		useClass: DepthFiveLeafService,
		lifecycle: LifecycleEnum.transient,
	});
	container.register(IDepthFiveLevel4Service, {
		useClass: DepthFiveLevel4Service,
		lifecycle: LifecycleEnum.transient,
	});
	container.register(IDepthFiveLevel3Service, {
		useClass: DepthFiveLevel3Service,
		lifecycle: LifecycleEnum.transient,
	});
	container.register(IDepthFiveLevel2Service, {
		useClass: DepthFiveLevel2Service,
		lifecycle: LifecycleEnum.transient,
	});
	container.register(IDepthFiveRootService, {
		useClass: DepthFiveRootService,
		lifecycle: LifecycleEnum.transient,
	});

	return () => container.resolve(IDepthFiveRootService).value;
}

describe("resolve throughput: provider and topology scenarios", () => {
	const useValueResolver = createUseValueResolver();
	const transientResolver = createTransientResolver();
	const singletonResolver = createSingletonResolver();
	const factoryResolver = createFactoryResolver();
	const aliasResolver = createAliasResolver();
	const parentChildResolver = createParentChildResolver();

	bench(
		"useValue local (1,000,000 resolves)",
		() => runResolveBatch(useValueResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useClass transient (1,000,000 resolves)",
		() => runResolveBatch(transientResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useClass singleton (1,000,000 resolves)",
		() => runResolveBatch(singletonResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useFactory transient (1,000,000 resolves)",
		() => runResolveBatch(factoryResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useAlias local (1,000,000 resolves)",
		() => runResolveBatch(aliasResolver),
		BENCH_OPTIONS,
	);
	bench(
		"child resolve parent (1,000,000 resolves)",
		() => runResolveBatch(parentChildResolver),
		BENCH_OPTIONS,
	);
});

describe("resolve throughput: middleware overhead", () => {
	const zeroMiddlewareResolver = createMiddlewareResolver(0);
	const oneMiddlewareResolver = createMiddlewareResolver(1);
	const threeMiddlewareResolver = createMiddlewareResolver(3);

	bench(
		"0 local middleware (1,000,000 resolves)",
		() => runResolveBatch(zeroMiddlewareResolver),
		BENCH_OPTIONS,
	);
	bench(
		"1 local middleware (1,000,000 resolves)",
		() => runResolveBatch(oneMiddlewareResolver),
		BENCH_OPTIONS,
	);
	bench(
		"3 local middleware (1,000,000 resolves)",
		() => runResolveBatch(threeMiddlewareResolver),
		BENCH_OPTIONS,
	);
});

describe("resolve throughput: dependency depth", () => {
	const depthOneResolver = createDepthOneResolver();
	const depthThreeResolver = createDepthThreeResolver();
	const depthFiveResolver = createDepthFiveResolver();

	bench(
		"depth 1 transient graph (1,000,000 resolves)",
		() => runResolveBatch(depthOneResolver),
		BENCH_OPTIONS,
	);
	bench(
		"depth 3 transient graph (1,000,000 resolves)",
		() => runResolveBatch(depthThreeResolver),
		BENCH_OPTIONS,
	);
	bench(
		"depth 5 transient graph (1,000,000 resolves)",
		() => runResolveBatch(depthFiveResolver),
		BENCH_OPTIONS,
	);
});
