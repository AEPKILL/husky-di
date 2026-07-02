/**
 * @overview Builds the highlighted step data for the Code Hike scrollycoding
 * demo route.
 * @author AEPKILL
 * @created 2026-06-30 11:38:00
 */

import type { RawCode } from "codehike/code";
import { highlight } from "codehike/code";
import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";

const CODEHIKE_SCROLLY_DEMO_THEME = "slack-dark";

type CodehikeScrollyDemoDefinition = Readonly<{
	id: string;
	eyebrow: string;
	fileName: string;
	title: string;
	summary: string;
	details: readonly string[];
	codeblock: RawCode;
}>;

const CODEHIKE_SCROLLY_DEMO_DEFINITIONS: readonly CodehikeScrollyDemoDefinition[] =
	[
		{
			id: "service-identifiers",
			eyebrow: "Step 1",
			fileName: "app.ts",
			title: "Define services with repository-native terminology",
			summary:
				"Start with `createServiceIdentifier()` so the runtime name and the TypeScript type stay aligned.",
			details: [
				"Husky DI prefers explicit service identifiers over hidden magic.",
				"The example mirrors the quick start in `@husky-di/core`.",
			],
			codeblock: {
				lang: "ts",
				meta: "title=app.ts",
				value: `import {
  createServiceIdentifier,
  resolve,
} from "@husky-di/core";

interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(\`[log] \${message}\`);
  }
}

class UserService {
  private readonly logger = resolve(ILogger);
}

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IUserService =
  createServiceIdentifier<UserService>("IUserService");`,
			},
		},
		{
			id: "container-registration",
			eyebrow: "Step 2",
			fileName: "app.ts",
			title: "Create a container and register the first dependency",
			summary:
				"Code Hike is just rendering here; the code itself stays faithful to Husky DI's explicit `register()` model.",
			details: [
				"`createContainer()` gives us a concrete boundary for registrations and resolution.",
				"The logger is registered first so later services can reuse it through the resolution chain.",
			],
			codeblock: {
				lang: "ts",
				meta: "title=app.ts",
				value: `import {
  createContainer,
  createServiceIdentifier,
  resolve,
} from "@husky-di/core";

interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(\`[log] \${message}\`);
  }
}

class UserService {
  private readonly logger = resolve(ILogger);
}

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IUserService =
  createServiceIdentifier<UserService>("IUserService");

const container = createContainer("DocsDemoContainer");

container.register(ILogger, {
  useClass: ConsoleLogger,
});`,
			},
		},
		{
			id: "service-registration",
			eyebrow: "Step 3",
			fileName: "app.ts",
			title: "Register the feature service that consumes the logger",
			summary:
				"The service stays small and deterministic: it reads `ILogger` through `resolve()` inside the active resolution flow.",
			details: [
				"This keeps the example consistent with the current core README.",
				"The container now knows how to build both the infrastructure service and the feature service.",
			],
			codeblock: {
				lang: "ts",
				meta: "title=app.ts",
				value: `import {
  createContainer,
  createServiceIdentifier,
  resolve,
} from "@husky-di/core";

interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(\`[log] \${message}\`);
  }
}

class UserService {
  private readonly logger = resolve(ILogger);

  getUser(id: string) {
    this.logger.log(\`load user: \${id}\`);
    return { id, name: "Ada" };
  }
}

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IUserService =
  createServiceIdentifier<UserService>("IUserService");

const container = createContainer("DocsDemoContainer");

container.register(ILogger, {
  useClass: ConsoleLogger,
});

container.register(IUserService, {
  useClass: UserService,
});`,
			},
		},
		{
			id: "resolution",
			eyebrow: "Step 4",
			fileName: "app.ts",
			title: "Resolve the service and let the container wire the graph",
			summary:
				"When this final step becomes active, the left panel shows the completed example exactly like a scrollycoding chapter would.",
			details: [
				"`container.resolve()` kicks off the resolution chain.",
				"`UserService` can immediately use `ILogger` without manual plumbing in the call site.",
			],
			codeblock: {
				lang: "ts",
				meta: "title=app.ts",
				value: `import {
  createContainer,
  createServiceIdentifier,
  resolve,
} from "@husky-di/core";

interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(\`[log] \${message}\`);
  }
}

class UserService {
  private readonly logger = resolve(ILogger);

  getUser(id: string) {
    this.logger.log(\`load user: \${id}\`);
    return { id, name: "Ada" };
  }
}

const ILogger = createServiceIdentifier<Logger>("ILogger");
const IUserService =
  createServiceIdentifier<UserService>("IUserService");

const container = createContainer("DocsDemoContainer");

container.register(ILogger, {
  useClass: ConsoleLogger,
});

container.register(IUserService, {
  useClass: UserService,
});

const userService = container.resolve(IUserService);
console.log(userService.getUser("u-1"));`,
			},
		},
	];

export async function createCodehikeScrollyDemoSteps(): Promise<
	CodehikeScrollyDemoStep[]
> {
	const highlightedSteps = await Promise.all(
		CODEHIKE_SCROLLY_DEMO_DEFINITIONS.map(async (definition) => {
			const code = await highlight(
				definition.codeblock,
				CODEHIKE_SCROLLY_DEMO_THEME,
			);

			return {
				id: definition.id,
				eyebrow: definition.eyebrow,
				fileName: definition.fileName,
				title: definition.title,
				summary: definition.summary,
				details: definition.details,
				code,
			} satisfies CodehikeScrollyDemoStep;
		}),
	);

	return highlightedSteps;
}
