type Writable<T extends {}> = {
  -readonly [P in keyof T]: T[P];
};
