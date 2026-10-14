// Where the records sit in the response body (?envelope=). Add one by adding an entry.
import type { Rec } from "./datasets/types.js";

export interface EnvelopeMeta {
  dataset: string;
  page: number;
  pageSize: number;
  url: URL;
}

export interface Envelope {
  description: string;
  /** Where the records sit, as a dotted path ("$" = the root). */
  recordsPath: string;
  /** True when recordsPath holds one record object rather than an array. */
  single?: boolean;
  wrap: (records: Rec[], meta: EnvelopeMeta) => unknown;
}

export const envelopes = {
  data: { description: '{"data": [...]}', recordsPath: "data", wrap: (r) => ({ data: r }) },
  root: { description: "a bare JSON array", recordsPath: "$", wrap: (r) => r },
  nested: { description: '{"result": {"items": [...], "count": n}}', recordsPath: "result.items", wrap: (r) => ({ result: { items: r, count: r.length } }) },
  with_metadata: {
    description: '{"metadata": {...}, "data": [...]}',
    recordsPath: "data",
    wrap: (r, m) => ({ metadata: { dataset: m.dataset, count: r.length, generatedAt: new Date().toISOString() }, data: r }),
  },
  single: { description: '{"data": {...}}: the first record as an object, not an array', recordsPath: "data", single: true, wrap: (r) => ({ data: r[0] ?? null }) },
  wrong_key: { description: '{"results": [...]}: records under an unexpected key', recordsPath: "results", wrap: (r) => ({ results: r }) },
  paged: {
    description: '{"data": [one page], "page", "totalPages", "nextPage"}: ?page= and ?pageSize= pick the page',
    recordsPath: "data",
    wrap: (r, m) => {
      const totalPages = Math.max(1, Math.ceil(r.length / m.pageSize));
      const next = new URL(m.url);
      next.searchParams.set("page", String(m.page + 1));
      return {
        data: r.slice((m.page - 1) * m.pageSize, m.page * m.pageSize),
        page: m.page,
        pageSize: m.pageSize,
        totalPages,
        totalRecords: r.length,
        nextPage: m.page < totalPages ? next.toString() : null,
      };
    },
  },
} satisfies Record<string, Envelope>;

export type EnvelopeName = keyof typeof envelopes;
