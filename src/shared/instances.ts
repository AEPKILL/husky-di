/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-23 10:09:14
 */

import { InstanceRefCount } from '../classes/instance-ref-count';
import { ResolveRecordManager } from '../classes/resolve-record-manager';

export const resolveRecordManagerRef = new InstanceRefCount(
  () => new ResolveRecordManager()
);
