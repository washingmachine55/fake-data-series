// Dotted paths into JSON values: "data.price", "intensity.actual"; "$" or "" is the value itself.

export function getPath(obj: unknown, path: string): unknown {
  if (path === "$" || path === "") return obj;
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;
  const parent = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, obj);
  parent[last] = value;
}
