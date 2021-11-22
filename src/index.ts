/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-11 15:49:22
 */

export { ClassProvider } from './providers/class.provider';
export { FactoryProvider } from './providers/factory.provider';
export { ValueProvider } from './providers/value.provider';

export { Tagged } from './decorators/tagged.decorator';
export { Inject } from './decorators/inject.decorator';
export { InjectRef } from './decorators/inject-ref.decorator';
export { CompilerMetadata } from './decorators/CompilerMetadata.decorator';

export { LifecycleEnum } from './enums/lifecycle.enum';

export { ServiceIdentifierManager } from './classes/service-identifier-manager';

export { Ref } from './types/ref.type';

export { createContainer } from './factory/create-container.factory';
export { createServiceIdentifier } from './factory/create-service-identifier.factory';

/**
 * # 代表 container
 */
