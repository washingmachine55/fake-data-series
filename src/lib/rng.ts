// Deterministic "random" numbers: the same seed parts always give the same value, so
// fetching a window twice returns identical data (upserts stay idempotent) unless the
// caller changes `revision`, which is part of every dataset's seed.

export function hash(...parts: (string | number)[]): number {
  let h = 0x811c9dc5; // FNV-1a
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  // murmur3 finaliser: spreads near-identical seeds (consecutive periods) over the range
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number in [0, 1). */
export const rand = (...parts: (string | number)[]) => hash(...parts) / 0x1_0000_0000;

export const between = (min: number, max: number, ...parts: (string | number)[]) =>
  min + (max - min) * rand(...parts);

export const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
