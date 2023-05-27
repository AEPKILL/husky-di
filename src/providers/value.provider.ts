/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:16:33
 */

import { ProviderBase } from "@/classes/base/provider.base";
import { IContainer } from "@/interfaces/container.interface";
import { ProviderOptions } from "@/interfaces/provider.interface";
import { ResolveContext } from "@/types/resolve-context.type";
import { setProviderInstance } from "@/utils/provider.utils";

export interface ValueProviderOptions<T> extends ProviderOptions {
  useValue: T;
}

export class ValueProvider<T> extends ProviderBase<T> {
  constructor(options: ValueProviderOptions<T>) {
    super(options);
    const { useValue } = options;

    setProviderInstance(this, useValue);
  }

  clone(): this {
    return new ValueProvider({
      lifecycle: this.lifecycle,
      isPrivate: this.isPrivate,
      useValue: this.instance,
    }) as this;
  }

  resolve(_container: IContainer, _resolveContext: ResolveContext): T {
    return this.instance!;
  }
}
