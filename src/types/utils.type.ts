/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 13:41:20
 */

export type Writable<T extends {}> = {
  -readonly [P in keyof T]: T[P];
};
