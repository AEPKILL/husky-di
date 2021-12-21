/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 15:49:22
 */

export {
  ClassProvider,
  ClassProviderOptions,
} from './providers/class.provider';
export {
  FactoryProvider,
  FactoryProviderOptions,
} from './providers/factory.provider';
export {
  ValueProvider,
  ValueProviderOptions,
} from './providers/value.provider';

export { tagged } from './decorators/tagged.decorator';
export { inject } from './decorators/inject.decorator';
export { compilerMetadata as CompilerMetadata } from './decorators/compiler-metadata.decorator';

export { LifecycleEnum } from './enums/lifecycle.enum';

export { ServiceIdentifierManager } from './classes/service-identifier-manager';

export { Ref } from './types/ref.type';

export { createContainer } from './factory/create-container.factory';
export { createServiceIdentifier } from './factory/create-service-identifier.factory';
export { ServiceIdentifier } from './types/service-identifier.type';

export {
  IContainer,
  ResolveReturnType,
} from './interfaces/container.interface';

/**
 * # 代表 container
 */
