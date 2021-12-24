/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-04 03:00:26
 */

import { IContainer } from '..';
import { ServiceIdentifier } from '../types/service-identifier.type';

declare global {
  namespace HuskyDi {
    interface ResolveOptions<T> {
      dynamic?: boolean;
      multiple?: boolean;
      ref?: boolean;
      optional?: boolean;
      defaultValue?: T | T[];
      container?: IContainer;
    }

    interface InjectionOptions<T> {}

    interface InjectionMetadata<T>
      extends ResolveOptions<T>,
        InjectionOptions<T> {
      serviceIdentifier: ServiceIdentifier<T>;
    }
  }
}
