type PathValue<T, P extends string> = P extends `${infer K}.${infer R}`
  ? K extends keyof T
    ? PathValue<T[K], R>
    : undefined
  : P extends keyof T
    ? T[P]
    : undefined;

export function get<T, P extends string>(obj: T, path: P, defaultValue?: PathValue<T, P>): PathValue<T, P> | undefined {
  const keys = path.split('.');
  let result: unknown = obj;

  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = (result as Record<string, unknown>)[key];
  }

  return (result === undefined ? defaultValue : result) as PathValue<T, P> | undefined;
}
