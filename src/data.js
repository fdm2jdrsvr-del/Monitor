/*
  Data layer — pure functions, no DOM.
  Turns the raw dataset into what the page shows: status, trend, gaps, summaries.
  Every business rule lives here, in one place.
*/
import dataset from "../norrvik_dataset.json";

export const GROUP = dataset.group;
export const QUARTERS = dataset.quarters; // ["2024-Q4", …, "2026-Q3"], oldest first
export const LATEST = QUARTERS.indexOf(dataset.as_of);

// Rules
const NEAR_SHARE = 0.25; // within a quarter of the range width from an edge = near limit (0.5 pp on a 2–4% range)
const STABLE_PP = 0.1; // quarter-on-quarter moves under 0.1 pp count as stable
const WINDOW = 8; // quarters shown in sparklines and the panel

const COUNTRY_CODES = {
  Finland: "fi", Sweden: "se", Germany: "de", Netherlands: "nl", "United Kingdom": "gb",
  France: "fr", Poland: "pl", Spain: "es", "United States": "us", Canada: "ca",
  Japan: "jp", Singapore: "sg", Australia: "au", Brazil: "br",
};

export const STATUS_ORDER = ["out-of-range", "stale", "near-limit", "in-range", "no-data"];
export const STATUS_LABEL = {
  "out-of-range": "Out of range",
  "near-limit": "Near limit",
  "in-range": "In range",
  stale: "Stale data",
  "no-data": "No data",
};

export const quarterLabel = (q) => q.split("-").reverse().join(" "); // "2026-Q3" → "Q3 2026"
export const shortQuarter = (q) => q.split("-")[1]; // → "Q3"

/** Where a margin sits against its policy range. */
export function classify(value, min, max) {
  if (value == null) return "no-data";
  if (value < min || value > max) return "out-of-range";
  const edge = (max - min) * NEAR_SHARE;
  return value - min < edge || max - value < edge ? "near-limit" : "in-range";
}

/** Percentage points outside the range: negative below, positive above, 0 inside. */
export function gap(value, min, max) {
  if (value == null) return null;
  if (value < min) return value - min;
  if (value > max) return value - max;
  return 0;
}

/** Movement between two quarters, judged against the middle of the range. */
export function trend(now, before, min, max) {
  if (now == null || before == null) return null;
  const delta = now - before;
  const direction = delta > 0 ? "up" : "down";
  if (Math.abs(delta) < STABLE_PP) return { status: "stable", direction: "flat", delta };
  const mid = (min + max) / 2;
  const toward = Math.abs(now - mid) < Math.abs(before - mid);
  return { status: toward ? "recovering" : "drifting", direction, delta };
}

/** One entity as of a given quarter index. */
export function deriveEntity(e, asOf) {
  const min = e.policy_min_pct;
  const max = e.policy_max_pct;
  const quarters = QUARTERS.slice(Math.max(0, asOf - WINDOW + 1), asOf + 1);
  const series = quarters.map((q) => ({ q, value: e.quarterly_margin_pct[q] ?? null }));
  const value = (back) => series.at(-1 - back)?.value ?? null;

  const current = value(0);
  const lastKnown = series.findLast((s) => s.value != null) ?? null;
  const status = current != null ? classify(current, min, max) : lastKnown ? "stale" : "no-data";

  return {
    id: e.entity_id,
    name: e.name,
    country: e.country,
    city: e.city,
    code: COUNTRY_CODES[e.country] ?? null,
    currency: e.currency,
    role: e.role,
    metric: e.tested_metric,
    min,
    max,
    revenue: e.annual_revenue_meur,
    series,
    current,
    lastKnown,
    status,
    gap: gap(current, min, max),
    qoq: trend(current, value(1), min, max), // vs previous quarter
    yoy: trend(current, value(4), min, max), // vs same quarter last year
    missing: series.filter((s) => s.value == null).length,
    reported: series.length,
  };
}

const average = (values) => {
  const known = values.filter((v) => v != null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

/**
 * Year-to-date average and a full-year projection for the as-of year.
 * Projection assumes the remaining quarters stay at the latest reported level.
 */
export function yearOutlook(row, asOf) {
  const [year, q] = QUARTERS[asOf].split("-");
  const done = row.series.filter((s) => s.q.startsWith(year)).map((s) => s.value);
  const ytd = average(done);
  const remaining = 4 - Number(q.slice(1));
  const latest = row.lastKnown?.value ?? null;
  const fy = ytd == null ? null : average([...done, ...Array(remaining).fill(latest)]);
  return { year, ytd, fy, complete: remaining === 0, fyStatus: classify(fy, row.min, row.max) };
}

/** Headline numbers for the KPI row. */
export function summarize(rows) {
  const count = (status) => rows.filter((r) => r.status === status).length;
  const byRole = Object.groupBy(rows, (r) => r.role);
  const [riskRole, riskRows] = Object.entries(byRole)
    .map(([role, list]) => [role, list, list.filter((r) => r.status === "out-of-range").length / list.length])
    .sort((a, b) => b[2] - a[2])[0];

  // Share of reporting entities inside their range, per quarter of the window.
  const window = rows[0]?.series.map((s) => s.q) ?? [];
  const inRangeShare = window.map((q, i) => {
    const reported = rows.filter((r) => r.series[i].value != null);
    const inside = reported.filter((r) => classify(r.series[i].value, r.min, r.max) !== "out-of-range");
    return { q, value: reported.length ? (inside.length / reported.length) * 100 : null };
  });

  return {
    total: rows.length,
    out: count("out-of-range"),
    near: count("near-limit"),
    inRange: count("in-range"),
    missing: count("stale") + count("no-data"),
    riskRole,
    riskOut: riskRows.filter((r) => r.status === "out-of-range").length,
    riskTotal: riskRows.length,
    inRangeShare,
  };
}

export const entities = (asOf) => dataset.entities.map((e) => deriveEntity(e, asOf));
