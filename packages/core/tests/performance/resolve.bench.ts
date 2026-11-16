/**
 * @overview Local benchmarks for core resolve throughput across common scenarios.
 *
 * Samples perform 100,000 entry resolves, or 10,000 for the longer graphs.
 * Each label states its batch size; nested resolutions add work to that batch.
 *
 * @author AEPKILL
 * @created 2026-06-25 17:18:34 15:58:49
 */

import { bench, describe } from "vitest";

import {
	createContainer,
	createServiceIdentifier,
	LifecycleEnum,
	middleware,
	resolve,
} from "../../src/index";

type BenchResolver = () => number;
type BenchValue = {
	readonly value: number;
};

const RESOLVE_BATCH_SIZE = 100_000;

const BENCH_OPTIONS = {
	iterations: 20,
	time: 1,
	warmupIterations: 5,
	warmupTime: 1,
};

let _sink = 0;

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

function runResolveBatch(
	resolveValue: BenchResolver,
	batchSize = RESOLVE_BATCH_SIZE,
): void {
	for (let index = 0; index < batchSize; index += 1) {
		consume(resolveValue());
	}
}

function createUseValueResolver(message?: string): BenchResolver {
	const options = message ? { message } : undefined;
	const container = createContainer("UseValueBenchContainer");
	container.register(IUseValueService, {
		useValue: {
			value: 1,
		},
	});

	return options
		? () => container.resolve(IUseValueService, options).value
		: () => container.resolve(IUseValueService).value;
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

function createAliasResolver(message?: string): BenchResolver {
	const options = message ? { message } : undefined;
	const container = createContainer("AliasBenchContainer");
	container.register(IAliasTargetService, {
		useValue: {
			value: 1,
		},
	});
	container.register(IAliasService, {
		useAlias: IAliasTargetService,
	});

	return options
		? () => container.resolve(IAliasService, options).value
		: () => container.resolve(IAliasService).value;
}

function createParentChildResolver(depth = 1): BenchResolver {
	const parent = createContainer("ParentBenchContainer");
	let child = parent;
	for (let index = 0; index < depth; index += 1) {
		child = createContainer(`ChildBenchContainer-${index}`, child);
	}

	parent.register(IParentValueService, {
		useValue: {
			value: 1,
		},
	});

	return () => child.resolve(IParentValueService).value;
}

function createMiddlewareResolver(): BenchResolver {
	const container = createContainer("MiddlewareBenchContainer");
	container.register(IUseValueService, {
		useValue: {
			value: 1,
		},
	});

	return () => container.resolve(IUseValueService).value;
}

function runMiddlewareResolveBatch(
	resolver: BenchResolver,
	middlewareCount: number,
): void {
	const middlewares: Parameters<typeof middleware.use> = [];
	for (let index = 0; index < middlewareCount; index += 1) {
		middlewares.push({
			name: `middleware-bench-${middlewareCount}-${index}`,
			executor: (params, next) => next(params),
		});
	}

	const cleanup = middleware.use(...middlewares);
	try {
		runResolveBatch(resolver);
	} finally {
		cleanup();
	}
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

function createLongChainResolver(depth: number): BenchResolver {
	const container = createContainer("LongChainBenchContainer");
	let identifier = createServiceIdentifier<BenchValue>("ChainLeaf");
	container.register(identifier, { useValue: { value: 1 } });
	for (let index = 1; index < depth; index += 1) {
		const dependency = identifier;
		identifier = createServiceIdentifier<BenchValue>(`Chain-${index}`);
		container.register(identifier, {
			useFactory: () => ({ value: resolve(dependency).value + 1 }),
		});
	}
	return () => container.resolve(identifier).value;
}

function createResolutionReuseResolver(): BenchResolver {
	const container = createContainer("ResolutionReuseBenchContainer");
	container.register(IFactoryService, {
		useFactory: () => ({ value: 1 }),
		lifecycle: LifecycleEnum.resolution,
	});
	container.register(IUseValueService, {
		useFactory: () => ({
			value:
				resolve(IFactoryService).value +
				resolve(IFactoryService).value +
				resolve(IFactoryService).value,
		}),
	});
	return () => container.resolve(IUseValueService).value;
}

function createMultipleResolver(): BenchResolver {
	const container = createContainer("MultipleBenchContainer");
	for (let index = 0; index < 3; index += 1) {
		container.register(IUseValueService, { useValue: { value: index } });
	}
	return () => container.resolve(IUseValueService, { multiple: true }).length;
}

describe("resolve throughput: provider and topology scenarios", () => {
	const useValueResolver = createUseValueResolver();
	const transientResolver = createTransientResolver();
	const singletonResolver = createSingletonResolver();
	const factoryResolver = createFactoryResolver();
	const aliasResolver = createAliasResolver();
	const parentChildResolver = createParentChildResolver();

	bench(
		"useValue local (100,000 resolves)",
		() => runResolveBatch(useValueResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useClass transient (100,000 resolves)",
		() => runResolveBatch(transientResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useClass singleton (100,000 resolves)",
		() => runResolveBatch(singletonResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useFactory transient (100,000 resolves)",
		() => runResolveBatch(factoryResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useAlias local (100,000 resolves)",
		() => runResolveBatch(aliasResolver),
		BENCH_OPTIONS,
	);
	bench(
		"child resolve parent (100,000 resolves)",
		() => runResolveBatch(parentChildResolver),
		BENCH_OPTIONS,
	);
});

describe("resolve throughput: middleware overhead", () => {
	const middlewareResolver = createMiddlewareResolver();

	bench(
		"0 middleware (100,000 resolves)",
		() => runMiddlewareResolveBatch(middlewareResolver, 0),
		BENCH_OPTIONS,
	);
	bench(
		"1 middleware (100,000 resolves)",
		() => runMiddlewareResolveBatch(middlewareResolver, 1),
		BENCH_OPTIONS,
	);
	bench(
		"3 middleware (100,000 resolves)",
		() => runMiddlewareResolveBatch(middlewareResolver, 3),
		BENCH_OPTIONS,
	);
});

describe("resolve throughput: dependency depth", () => {
	const depthOneResolver = createDepthOneResolver();
	const depthThreeResolver = createDepthThreeResolver();
	const depthFiveResolver = createDepthFiveResolver();

	bench(
		"depth 1 transient graph (100,000 resolves)",
		() => runResolveBatch(depthOneResolver),
		BENCH_OPTIONS,
	);
	bench(
		"depth 3 transient graph (100,000 resolves)",
		() => runResolveBatch(depthThreeResolver),
		BENCH_OPTIONS,
	);
	bench(
		"depth 5 transient graph (100,000 resolves)",
		() => runResolveBatch(depthFiveResolver),
		BENCH_OPTIONS,
	);
});

describe("resolve throughput: annotated entries", () => {
	const valueResolver = createUseValueResolver("Load value");
	const aliasResolver = createAliasResolver("Load aliased value");

	bench(
		"useValue with message (100,000 resolves)",
		() => runResolveBatch(valueResolver),
		BENCH_OPTIONS,
	);
	bench(
		"useAlias with message (100,000 resolves)",
		() => runResolveBatch(aliasResolver),
		BENCH_OPTIONS,
	);
});

describe("resolve throughput: lifecycle and extended topology", () => {
	const resolutionResolver = createResolutionReuseResolver();
	const singletonResolver = createSingletonResolver();
	const multipleResolver = createMultipleResolver();
	const parentResolver = createParentChildResolver(10);
	const chainResolver = createLongChainResolver(20);

	bench(
		"resolution lifecycle reused 3 times (100,000 resolves)",
		() => runResolveBatch(resolutionResolver),
		BENCH_OPTIONS,
	);
	bench(
		"singleton with 1 middleware (100,000 resolves)",
		() => runMiddlewareResolveBatch(singletonResolver, 1),
		BENCH_OPTIONS,
	);
	bench(
		"multiple 3 values (100,000 resolves)",
		() => runResolveBatch(multipleResolver),
		BENCH_OPTIONS,
	);
	bench(
		"parent depth 10 (10,000 resolves)",
		() => runResolveBatch(parentResolver, 10_000),
		BENCH_OPTIONS,
	);
	bench(
		"factory depth 20 (10,000 resolves)",
		() => runResolveBatch(chainResolver, 10_000),
		BENCH_OPTIONS,
	);
});
