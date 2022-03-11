/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-23 10:09:14
 */

import { InstanceRefCount } from '../classes/instance-ref-count';
import { ResolveRecordManager } from '../classes/resolve-record-manager';
import { TargetInjectionMetadata } from '../classes/target-injection-metadata';

export const resolveRecordManagerRef = new InstanceRefCount(
  () => new ResolveRecordManager()
);

export const targetInjectionMetadata = new TargetInjectionMetadata();
