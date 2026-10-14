// Named presets: a dataset plus fixed query params, served at /cases/{name}. Params in the
// request override the preset's (so a client's own from/to still apply). Add one by adding
// an entry.

export interface Case {
  dataset: string;
  query: Record<string, string>;
  description: string;
}

export const cases: Record<string, Case> = {
  "duplicate-providers": {
    dataset: "market-index",
    query: {},
    description: "Two records per period with the same time: APXMIDP with real values, N2EXMIDP with zeros.",
  },
  "duplicate-providers-filtered": {
    dataset: "market-index",
    query: { dataProviders: "APXMIDP" },
    description: "The same feed filtered to one provider: one record per period.",
  },
  "clock-change-autumn": {
    dataset: "system-prices",
    query: { settlementDate: "2026-10-25" },
    description: "The October change day: 50 settlement periods.",
  },
  "clock-change-spring": {
    dataset: "system-prices",
    query: { settlementDate: "2026-03-29" },
    description: "The March change day: 46 settlement periods.",
  },
  "clock-change-naive-london": {
    dataset: "demand",
    query: { from: "2026-10-24T23:00:00Z", to: "2026-10-25T04:00:00Z", timeFormat: "naive_london" },
    description: "Naive London times across the October change: 01:00 and 01:30 appear twice.",
  },
  "naive-london-bst": {
    dataset: "demand",
    query: { timeFormat: "naive_london" },
    description: "London wall-clock times with no zone; in BST they are an hour off if read as UTC.",
  },
  "rfc1123-bst": {
    dataset: "demand",
    query: { from: "2026-07-14T00:00:00Z", to: "2026-07-15T00:00:00Z", timeFormat: "rfc1123_london" },
    description: "RFC 1123 dates ending in BST.",
  },
  "epoch-ms-strings": { dataset: "meter-readings", query: { timeFormat: "epoch_ms_string" }, description: "Epoch milliseconds as strings." },
  "epoch-microseconds": { dataset: "meter-readings", query: { timeFormat: "epoch_us" }, description: "16-digit epoch microseconds." },
  "settlement-padded-periods": {
    dataset: "system-prices",
    query: { periodStyle: "padded", dateStyle: "iso_midnight" },
    description: 'Periods as "07" and dates as ISO midnight.',
  },
  "settlement-zero-based": { dataset: "system-prices", query: { periodStyle: "zero_based" }, description: "Periods counted from 0." },
  "junk-values": { dataset: "meter-readings", query: { valueStyle: "junk" }, description: 'About a third of values are null, "", "N/A", "12,5", true, {}, "-" or "NaN".' },
  "string-values": { dataset: "system-prices", query: { valueStyle: "padded_string" }, description: 'Values as " 81.5 " strings.' },
  "negative-and-zero": {
    dataset: "unit-generation",
    query: { unit: "E_SOLAR-1,T_PUMPED-1" },
    description: "Solar is 0 at night; pumped storage is negative while pumping.",
  },
  "series-per-unit": { dataset: "unit-generation", query: {}, description: "Five units per period, to split by the unit field." },
  "nested-with-nulls": { dataset: "carbon-intensity", query: { to: "2026-12-31T00:00:00Z", from: "2026-12-30T00:00:00Z" }, description: "intensity.actual is null for future intervals." },
  "outside-window": { dataset: "demand", query: { outsideHours: "6" }, description: "Records 6 h before and after the requested window." },
  "conflicting-duplicates": { dataset: "demand", query: { duplicates: "changed", shuffle: "true" }, description: "Each time twice with different values, shuffled." },
  "gaps": { dataset: "demand", query: { gapsEvery: "5" }, description: "Every 5th interval missing." },
  "five-minute": { dataset: "meter-readings", query: { granularity: "5m" }, description: "5-minute readings." },
  "single-object": { dataset: "demand", query: { envelope: "single" }, description: '{"data": {...}} instead of an array.' },
  "wrong-records-key": { dataset: "demand", query: { envelope: "wrong_key" }, description: 'Records under "results", not "data".' },
  "bare-array": { dataset: "demand", query: { envelope: "root" }, description: "A bare JSON array." },
  "paged": { dataset: "meter-readings", query: { envelope: "paged", pageSize: "50" }, description: "50 records per page with a nextPage link." },
  "timeout": { dataset: "demand", query: { scenario: "delay", delayMs: "35000" }, description: "Answers after 35 s." },
  "rate-limited": { dataset: "demand", query: { scenario: "status", status: "429", retryAfter: "120" }, description: "429 with Retry-After: 120." },
  "server-error": { dataset: "demand", query: { scenario: "status", status: "500" }, description: "500." },
  "flaky": { dataset: "demand", query: { scenario: "flaky", failTimes: "2" }, description: "Two 500s, then 200 (reset with POST /admin/reset)." },
  "html-page": { dataset: "demand", query: { scenario: "html" }, description: "200 with HTML." },
  "broken-json": { dataset: "demand", query: { scenario: "broken_json" }, description: "200 with invalid JSON." },
  "truncated-json": { dataset: "demand", query: { scenario: "truncated_json" }, description: "200 with half a body." },
  "empty-window": { dataset: "demand", query: { from: "2026-10-14T00:05:00Z", to: "2026-10-14T00:25:00Z" }, description: "A window with no intervals: an empty array." },
  "no-content": { dataset: "demand", query: { scenario: "no_content" }, description: "204." },
  "huge": { dataset: "demand", query: { scenario: "huge", sizeMb: "12" }, description: "A 12 MB response." },
  "gzip": { dataset: "demand", query: { scenario: "gzip" }, description: "gzip-encoded body." },
  "redirect-chain": { dataset: "demand", query: { scenario: "redirect", hops: "3" }, description: "Three 302s, then the data." },
  "redirect-private": { dataset: "demand", query: { scenario: "redirect_private" }, description: "302 to 169.254.169.254." },
};
