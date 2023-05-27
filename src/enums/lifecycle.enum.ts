/**
/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-24 10:39:21
 */

export enum LifecycleEnum {
  /**
   * transient is the default lifecycle type.
   * transient means that the container will create a new instance every time it is resolved.
   */
  transient,

  /**
   * singleton means that the container will create a new instance the first time it is resolved,
   * and then return the same instance every time it is resolved.
   */
  singleton,

  /**
   * resolution means that the container will create a new instance every time it is resolved,
   * and then return the same instance every time it is resolved in the same resolution context.
   */
  resolution,
}
