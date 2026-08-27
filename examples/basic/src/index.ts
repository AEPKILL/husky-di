/**
 * Public exports for the basic example package.
 *
 * @overview
 * Re-exports the basic example types, implementations, factory, and service identifiers.
 *
 * @author AEPKILL
 * @created 2026-07-08 10:48:48
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */

export type { UserProfile } from "@/types/user-profile.type";

export { createBasicExampleContainer } from "@/factories/basic-example-container.factory";
export { ConsoleLoggerImpl } from "@/impls/console-logger.impl";
export { DefaultUserServiceImpl } from "@/impls/default-user-service.impl";
export { InMemoryUserRepositoryImpl } from "@/impls/in-memory-user-repository.impl";
export { IAppConfig } from "@/interfaces/app-config.interface";
export { IAppLogger, ILogger } from "@/interfaces/logger.interface";
export { IUserRepository } from "@/interfaces/user-repository.interface";
export { IUserService } from "@/interfaces/user-service.interface";
