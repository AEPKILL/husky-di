/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-04 03:00:26
 */

import { ServiceIdentifier } from '../types/service-identifier.type';

declare global {
  namespace HuskyDi {
    interface ResolveOptions<T> {
      multiple?: boolean;
      ref?: boolean;
      optional?: boolean;
      defaultValue?: T | T[];
    }

    interface InjectionOptions<T> {}

    interface InjectionMetadata<T>
      extends ResolveOptions<T>,
        InjectionOptions<T> {
      serviceIdentifier: ServiceIdentifier<T>;
    }
  }
}
