/*
  Render — small template functions that return HTML strings.
  One function per Figma component; COLUMNS drives the table and the Columns menu.
*/
import { STATUS_LABEL, classify, gap, quarterLabel, shortQuarter, yearOutlook } from "./data.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ESC[c]);

const minus = (text) => text.replace("-", "−");
export const pct = (v) => (v == null ? "—" : minus(`${v.toFixed(1)}%`));
const pp = (v) => (Math.abs(v) < 0.05 ? "0.0 pp" : minus(`${v > 0 ? "+" : ""}${v.toFixed(1)} pp`));
const range = (r) => `${r.min.toFixed(1)}–${r.max.toFixed(1)}%`;
const share = (n, total) => `${Math.round((n / total) * 100)}%`;

export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/icons.svg#${name}"/></svg>`;
const flag = (code) =>
  code ? `<img class="flag" src="/flags/${code}.svg" alt="" width="20" height="14">` : "";

export const badge = (status, label = STATUS_LABEL[status]) =>
  `<span class="badge" data-status="${status}">${esc(label)}</span>`;

const TREND_ICON = { up: "arrow-up-right", down: "arrow-down-right", flat: "arrow-right" };
const TREND_LABEL = { recovering: "Recovering", stable: "Stable", drifting: "Drifting" };

export function trendTag(t, suffix = "") {
  if (!t) return `<span class="muted">—</span>`;
  return `<span class="trend" data-trend="${t.status}">${icon(TREND_ICON[t.direction])}<span class="trend__label">${TREND_LABEL[t.status]}</span><span class="trend__delta num">${pp(t.delta)}${suffix}</span></span>`;
}

/* Range bar: the policy band sits in the middle third, the marker is clamped to the bar. */
function rangeBar(r, value) {
  const status = classify(value, r.min, r.max);
  const position =
    value == null ? "no-data"
    : status === "out-of-range" ? (value < r.min ? "below" : "above")
    : status === "near-limit" ? "near-limit"
    : "within";
  const at = value == null ? 50 : Math.min(96, Math.max(4, 100 / 3 + ((value - r.min) / (r.max - r.min)) * (100 / 3)));
  const label = value == null ? "No data" : `${pct(value)} against a ${range(r)} range`;
  return `<span class="range-bar" data-position="${position}" style="--start: 33.3%; --end: 66.7%; --value: ${at.toFixed(1)}%" role="img" aria-label="${label}"><span class="range-bar__marker"></span></span>`;
}

/* Sparkline: margin over the window, with the policy range as a band. Gaps break the line. */
export function spark(series, { min, max, label }) {
  const values = series.map((s) => s.value).filter((v) => v != null);
  if (!values.length) return `<span class="muted">—</span>`;
  const lo = Math.min(...values, min ?? Infinity);
  const hi = Math.max(...values, max ?? -Infinity);
  const pad = (hi - lo || 1) * 0.15;
  const y = (v) => (100 - ((v - lo + pad) / (hi - lo + pad * 2)) * 100).toFixed(1);
  const x = (i) => ((i / Math.max(1, series.length - 1)) * 100).toFixed(1);
  let d = "";
  let pen = "M";
  series.forEach((s, i) => {
    if (s.value == null) return (pen = "M");
    d += `${pen}${x(i)} ${y(s.value)} `;
    pen = "L";
  });
  const band = min == null ? "" : `<rect class="spark__band" x="0" width="100" y="${y(max)}" height="${(y(min) - y(max)).toFixed(1)}"/>`;
  return `<svg class="spark" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${band}<path class="spark__line" d="${d.trim()}"/></svg>`;
}

const sparkLabel = (r) => {
  const known = r.series.filter((s) => s.value != null);
  return `Margin ${quarterLabel(known[0].q)} to ${quarterLabel(known.at(-1).q)}: ${pct(known[0].value)} to ${pct(known.at(-1).value)}`;
};

/* Table columns. sort returns a comparable value; "desc" puts the most urgent first. */
const SEVERITY = { "out-of-range": 4, stale: 3, "near-limit": 2, "in-range": 1, "no-data": 0 };
const TREND_RANK = { drifting: 2, stable: 1, recovering: 0 };

export const COLUMNS = [
  {
    key: "name",
    label: "Name",
    sort: (r) => r.name,
    cell: (r) => `<div class="entity"><button class="entity__name" type="button" aria-expanded="false" aria-controls="entity-panel" data-entity="${r.id}">${esc(r.name)}</button><span class="entity__meta">${r.code?.toUpperCase() ?? ""} · ${esc(r.role)}</span></div>`,
  },
  { key: "status", label: "Status", sort: (r) => SEVERITY[r.status], cell: (r) => badge(r.status) },
  {
    key: "trend",
    label: "Trend",
    title: "Compared with the same quarter last year",
    sort: (r) => TREND_RANK[r.yoy?.status] ?? -1,
    cell: (r) => trendTag(r.yoy),
  },
  {
    key: "range",
    label: "Policy range",
    sort: (r) => Math.abs(r.gap ?? 0),
    cell: (r) => {
      const value = r.current ?? r.lastKnown?.value ?? null;
      const stale = r.current == null && value != null;
      const title = stale ? ` title="Last reported ${quarterLabel(r.lastKnown.q)}"` : "";
      return `<span class="range-cell"><span class="num${stale ? " is-stale" : ""}"${title}>${pct(value)}</span>${rangeBar(r, value)}</span>`;
    },
  },
  {
    key: "country",
    label: "Country",
    sort: (r) => `${r.country} ${r.city}`,
    cell: (r) => `<span class="country">${flag(r.code)}${esc(r.country)} · ${esc(r.city)}</span>`,
  },
  { key: "currency", label: "Currency", sort: (r) => r.currency, cell: (r) => r.currency },
  { key: "role", label: "Role", sort: (r) => r.role, cell: (r) => esc(r.role) },
  {
    key: "quarters",
    label: "Quarters",
    title: "Quarters reported in the last eight",
    sort: (r) => r.missing,
    cell: (r) =>
      r.missing
        ? badge("out-of-range", `${r.missing} missing`)
        : badge("in-range", `${r.reported}/${r.reported}`),
  },
  {
    key: "qoq",
    label: (ctx) => `Vs ${ctx.previous}`,
    title: "Compared with the previous quarter",
    sort: (r) => TREND_RANK[r.qoq?.status] ?? -1,
    cell: (r) => trendTag(r.qoq),
  },
  {
    key: "spark",
    label: "Last 8 quarters",
    cell: (r) => spark(r.series, { min: r.min, max: r.max, label: sparkLabel(r) }),
  },
];

export const columnLabel = (col, ctx) => (typeof col.label === "function" ? col.label(ctx) : col.label);

/* KPI row */
function kpi({ tone, label, value, caption, text = false }) {
  return `<article class="kpi"${tone ? ` data-tone="${tone}"` : ""}>
    <h2 class="kpi__label">${label}</h2>
    <p class="kpi__value${text ? " kpi__value--text" : " num"}">${esc(value)}</p>
    <p class="kpi__caption">${caption}</p>
  </article>`;
}

export function renderKpis(s) {
  const trend = s.inRangeShare.filter((p) => p.value != null);
  const first = trend[0];
  const last = trend.at(-1);
  return [
    kpi({ tone: "danger", label: "Out of range", value: s.out, caption: `${share(s.out, s.total)} of entities` }),
    kpi({ tone: "warning", label: "Near a limit", value: s.near, caption: `${share(s.near, s.total)} of entities` }),
    kpi({ tone: "success", label: "In range", value: s.inRange, caption: `${share(s.inRange, s.total)} of entities` }),
    kpi({ tone: "danger", label: "Role at biggest risk", value: s.riskRole, caption: `${s.riskOut} of ${s.riskTotal} out of range`, text: true }),
    kpi({ tone: s.missing ? "danger" : null, label: "Missing data", value: s.missing, caption: "Latest quarter not reported" }),
    `<article class="kpi">
      <h2 class="kpi__label">Group trend</h2>
      ${spark(trend, { label: `Share of entities inside their range, ${quarterLabel(first.q)} to ${quarterLabel(last.q)}` })}
      <p class="kpi__caption">In range: ${Math.round(first.value)}% → ${Math.round(last.value)}%</p>
    </article>`,
  ].join("");
}

/* Table body, flat or grouped */
function rowHtml(r, cols, openId) {
  const cells = cols
    .map((c) => (c.key === "name" ? `<th scope="row">${c.cell(r)}</th>` : `<td>${c.cell(r)}</td>`))
    .join("");
  return `<tr data-row="${r.id}"${r.id === openId ? " data-open" : ""}>${cells}</tr>`;
}

function groupSummary(list) {
  const counts = ["out-of-range", "stale", "near-limit"]
    .map((s) => [s, list.filter((r) => r.status === s).length])
    .filter(([, n]) => n);
  if (!counts.length) return badge("in-range", "All in range");
  return counts.map(([s, n]) => badge(s, `${n} ${STATUS_LABEL[s].toLowerCase()}`)).join("");
}

export function renderRows(rows, cols, { groupBy, collapsed, openId }) {
  if (groupBy === "none") return `<tbody>${rows.map((r) => rowHtml(r, cols, openId)).join("")}</tbody>`;

  const groups = Object.entries(Object.groupBy(rows, (r) => r[groupBy])).sort(
    ([a, x], [b, y]) =>
      y.filter((r) => r.status === "out-of-range").length - x.filter((r) => r.status === "out-of-range").length ||
      a.localeCompare(b),
  );

  return groups
    .map(([name, list]) => {
      const open = !collapsed.has(name);
      return `<tbody class="group"${open ? "" : " data-collapsed"}>
        <tr class="group__row">
          <th colspan="${cols.length}" scope="rowgroup">
            <div class="group__head">
              <button class="group__toggle" type="button" aria-expanded="${open}" data-group="${esc(name)}">
                ${icon("chevron-down")}${groupBy === "country" ? flag(list[0].code) : ""}<span class="group__name">${esc(name)}</span>
                <span class="group__count">${list.length} ${list.length === 1 ? "entity" : "entities"}</span>
              </button>
              <span class="cluster">${groupSummary(list)}</span>
            </div>
          </th>
        </tr>
        ${list.map((r) => rowHtml(r, cols, openId)).join("")}
      </tbody>`;
    })
    .join("");
}

/* Entity panel */
function stat({ tone, label, value, caption }) {
  return `<div class="stat"${tone ? ` data-tone="${tone}"` : ""}><dt>${label}</dt><dd class="stat__value num">${value}</dd><dd class="stat__caption">${caption}</dd></div>`;
}

const toneOf = (status) => (status === "out-of-range" ? "danger" : status === "in-range" ? "success" : null);
const side = (value, r) => (value < r.min ? "below the floor" : "above the ceiling");

function currentStat(r, q) {
  if (r.current == null) {
    return stat({ label: `${q} margin`, value: "—", caption: r.lastKnown ? `Last reported ${quarterLabel(r.lastKnown.q)}` : "Never reported" });
  }
  const caption =
    r.status === "out-of-range" ? `${Math.abs(r.gap).toFixed(1)} pp ${r.gap < 0 ? "below" : "above"} range`
    : r.status === "near-limit" ? `Close to the ${r.current - r.min < r.max - r.current ? "floor" : "ceiling"}`
    : "Inside range";
  return stat({ tone: toneOf(r.status), label: `${q} margin`, value: pct(r.current), caption });
}

function callout(r, outlook, q) {
  const box = (tone, title, body) =>
    `<aside class="callout" data-tone="${tone}">${icon("alert")}<div><p class="callout__title">${title}</p><p>${body}</p></div></aside>`;

  if (r.current == null) {
    return box("warning", `${q} actuals missing`, `${r.lastKnown ? `Last reported ${quarterLabel(r.lastKnown.q)}.` : ""} Request the latest actuals from local finance before the year-end review.`);
  }
  if (outlook.fyStatus === "out-of-range") {
    const lead = outlook.complete
      ? `The full year closed at ${pct(outlook.fy)}`
      : `If margins stay at the ${q} level, the full year lands at ${pct(outlook.fy)}`;
    return box("danger", "Action needed before year-end", `${lead}, ${side(outlook.fy, r)} of the ${range(r)} range. Plan a year-end adjustment.`);
  }
  if (r.status !== "in-range" || r.qoq?.status === "drifting") {
    const why = r.status === "out-of-range" ? `${q} is outside the range` : r.status === "near-limit" ? `${q} is close to a limit` : `the margin moved ${pp(r.qoq.delta)} away from the middle of the range`;
    return box("warning", "Watch before year-end", `The full year is on track at ${pct(outlook.fy)}, but ${why}.`);
  }
  return "";
}

export function renderPanel(r, asOf, quarters) {
  const q = shortQuarter(quarters[asOf]);
  const outlook = yearOutlook(r, asOf);
  const fyLabel = outlook.complete ? `FY ${outlook.year}` : `FY ${outlook.year} projection`;
  const history = [...r.series].reverse();

  return `
    <header class="panel__header">
      <div class="panel__title-row">
        ${flag(r.code)}
        <h2 id="panel-title" tabindex="-1" data-autofocus>${esc(r.name)}</h2>
        <button class="icon-button" type="button" aria-label="Close panel" data-close="entity-panel">${icon("close")}</button>
      </div>
      <p class="panel__meta">${esc(r.country)} · ${esc(r.city)} · ${esc(r.role)} · ${r.id}</p>
      <div class="cluster" style="--cluster-gap: var(--space-12)">${badge(r.status)}${trendTag(r.qoq, ` vs ${shortQuarter(quarters[asOf - 1] ?? quarters[asOf])}`)}</div>
    </header>

    <div class="panel__body">
      <dl class="stats">
        ${currentStat(r, q)}
        ${stat({ tone: classify(outlook.ytd, r.min, r.max) === "out-of-range" ? "danger" : null, label: `YTD ${outlook.year}`, value: pct(outlook.ytd), caption: `Range ${range(r)}` })}
        ${stat({
          tone: toneOf(outlook.fyStatus),
          label: fyLabel,
          value: pct(outlook.fy),
          caption: outlook.fyStatus === "out-of-range" ? `${side(outlook.fy, r)[0].toUpperCase()}${side(outlook.fy, r).slice(1)}` : "Inside range",
        })}
      </dl>

      ${callout(r, outlook, q)}

      <section class="panel__section" aria-labelledby="panel-quarters">
        <div class="panel__section-head">
          <h3 id="panel-quarters">Quarterly results</h3>
          <span class="panel__note">${esc(r.metric)} · ${r.currency}</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th scope="col">Quarter</th><th scope="col" class="num">Margin</th><th scope="col" class="num">Vs range</th><th scope="col">Status</th></tr></thead>
            <tbody>
              ${history
                .map((s) => {
                  const status = classify(s.value, r.min, r.max);
                  const g = gap(s.value, r.min, r.max);
                  return `<tr><td>${quarterLabel(s.q)}</td><td class="num">${pct(s.value)}</td><td class="num">${g ? pp(g) : "—"}</td><td>${badge(status)}</td></tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel__section" aria-labelledby="panel-details">
        <h3 id="panel-details">Entity details</h3>
        <dl class="details">
          ${[
            ["Entity ID", r.id],
            ["Role", r.role],
            ["Tested metric", r.metric],
            ["Policy range", range(r)],
            ["Annual revenue", `€${r.revenue.toFixed(1)}m`],
            ["Currency", r.currency],
            ["Location", `${r.city}, ${r.country}`],
          ]
            .map(([dt, dd]) => `<div class="details__row"><dt>${dt}</dt><dd>${esc(dd)}</dd></div>`)
            .join("")}
        </dl>
      </section>
    </div>

    <footer class="panel__footer">
      <button class="button button--secondary" type="button">Request data</button>
      <button class="button button--primary" type="button">Plan adjustment</button>
    </footer>`;
}
