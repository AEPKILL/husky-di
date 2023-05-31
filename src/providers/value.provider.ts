/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-03 16:16:33
 */

import { ProviderBase } from '@/classes/base/provider.base';

import type { ProviderOptions } from "@/interfaces/provider.interface";

export interface ValueProviderOptions<T> extends ProviderOptions {
  useValue: T;
}

export class ValueProvider<T> extends ProviderBase<T> {
  private readonly _value: T;
  constructor(options: ValueProviderOptions<T>) {
    super(options);
    const { useValue } = options;

    this._value = useValue;
  }

  clone(): this {
    return new ValueProvider({
      lifecycle: this.lifecycle,
      isPrivate: this.isPrivate,
      useValue: this._value,
    }) as this;
  }

  resolve(): T {
    return this._value;
  }
}
