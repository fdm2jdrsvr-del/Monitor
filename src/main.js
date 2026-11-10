import "./styles/main.css";
import { GROUP, LATEST, QUARTERS, entities, quarterLabel, shortQuarter, summarize } from "./data.js";
import { COLUMNS, columnLabel, esc, icon, renderKpis, renderPanel, renderRows } from "./render.js";

/* ---------- State: everything the page shows is derived from this ---------- */
const state = {
  asOf: LATEST, // quarter index the view is "as of"
  filter: "all", // status chip
  countries: new Set(), // empty = all
  groupBy: "none", // none | country | role
  hidden: new Set(), // hidden column keys
  sort: { key: "status", dir: "desc" }, // most urgent first
  collapsed: new Set(), // collapsed group names
  openId: null, // entity shown in the panel
};

const $ = (selector) => document.querySelector(selector);
let rows = [];

const FILTERS = {
  all: () => true,
  "out-of-range": (r) => r.status === "out-of-range",
  "near-limit": (r) => r.status === "near-limit",
  missing: (r) => r.status === "stale" || r.status === "no-data",
  "in-range": (r) => r.status === "in-range",
};

function visibleRows() {
  const col = COLUMNS.find((c) => c.key === state.sort.key);
  const dir = state.sort.dir === "asc" ? 1 : -1;
  const compare = (a, b) => {
    const x = col.sort(a);
    const y = col.sort(b);
    const order = typeof x === "string" ? x.localeCompare(y) : x - y;
    return order * dir || a.name.localeCompare(b.name);
  };
  return rows
    .filter(FILTERS[state.filter])
    .filter((r) => !state.countries.size || state.countries.has(r.country))
    .sort(compare);
}

/* ---------- Render ---------- */
function render() {
  rows = entities(state.asOf);
  const quarter = quarterLabel(QUARTERS[state.asOf]);
  const ctx = { previous: shortQuarter(QUARTERS[state.asOf - 1] ?? QUARTERS[state.asOf]) };
  // The group header already names the country, so that column steps aside while grouped.
  const cols = COLUMNS.filter((c) => !state.hidden.has(c.key) && !(c.key === state.groupBy));
  const shown = visibleRows();
  const focusKey = rememberFocus();

  $("#period-label").textContent = `Actuals for ${quarter}`;
  $("#period-button-label").textContent = quarter;
  $("#kpis").innerHTML = renderKpis(summarize(rows));

  for (const [key, test] of Object.entries(FILTERS)) {
    document.querySelector(`[data-count="${key}"]`).textContent = rows.filter(test).length;
  }
  for (const chip of document.querySelectorAll("[data-filter]")) {
    chip.setAttribute("aria-pressed", String(chip.dataset.filter === state.filter));
  }
  setChip("#country-chip", "#country-value", state.countries.size ? state.countries.size : "all", state.countries.size > 0);
  setChip("#group-chip", "#group-value", state.groupBy === "none" ? "no" : state.groupBy, state.groupBy !== "none");
  setChip("#column-chip", "#column-value", state.hidden.size ? `${cols.length} of ${COLUMNS.length}` : "All", state.hidden.size > 0);

  const table = $("#entity-table");
  table.querySelectorAll("tbody").forEach((tbody) => tbody.remove());
  table.tHead.innerHTML = `<tr>${cols.map((c) => headerCell(c, ctx)).join("")}</tr>`;
  table.insertAdjacentHTML("beforeend", shown.length ? renderRows(shown, cols, state) : emptyBody(cols.length));
  $("#result-count").textContent = `${shown.length} of ${rows.length} entities shown`;

  if (state.openId) {
    const entity = rows.find((r) => r.id === state.openId);
    $("#entity-panel").innerHTML = renderPanel(entity, state.asOf, QUARTERS);
    document.querySelector(`[data-entity="${state.openId}"]`)?.setAttribute("aria-expanded", "true");
  }
  restoreFocus(focusKey);
}

function headerCell(col, ctx) {
  const label = columnLabel(col, ctx);
  const title = col.title ? ` title="${col.title}"` : "";
  if (!col.sort) return `<th scope="col"${title}>${label}</th>`;
  const active = state.sort.key === col.key;
  const ariaSort = active ? ` aria-sort="${state.sort.dir === "asc" ? "ascending" : "descending"}"` : "";
  return `<th scope="col"${ariaSort}${title}><button class="sort" type="button" data-sort="${col.key}">${label}${icon("arrow-down")}</button></th>`;
}

const emptyBody = (span) =>
  `<tbody><tr><td colspan="${span}" class="table__empty">No entities match these filters.</td></tr></tbody>`;

function setChip(chip, value, text, active) {
  $(value).textContent = text;
  $(chip).toggleAttribute("data-active", active);
}

/* Re-rendering replaces buttons, so keep keyboard focus on the same control. */
function rememberFocus() {
  const el = document.activeElement;
  for (const attr of ["data-sort", "data-group", "data-entity"]) {
    if (el?.hasAttribute(attr)) return `[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
  }
  return null;
}
const restoreFocus = (selector) => selector && document.querySelector(selector)?.focus();

/* ---------- Menus built once from the data ---------- */
function buildMenus() {
  $("#group-name").textContent = GROUP;

  $("#period-options").innerHTML = QUARTERS.map(
    (q, i) => `<label class="menu__option"><input class="checkbox" type="radio" name="period" value="${i}" ${i === state.asOf ? "checked data-autofocus" : ""}/><span>${quarterLabel(q)}</span></label>`,
  ).reverse().join("");

  const all = entities(state.asOf);
  const countries = Object.entries(Object.groupBy(all, (r) => r.country)).sort(([a], [b]) => a.localeCompare(b));
  $("#country-options").innerHTML = countries
    .map(
      ([name, list], i) => `<label class="menu__option"><input class="checkbox" type="checkbox" name="country" value="${esc(name)}"${i === 0 ? " data-autofocus" : ""}/><img class="flag" src="/flags/${list[0].code}.svg" alt="" width="20" height="14"><span>${esc(name)}</span><span class="menu__count">${list.length}</span></label>`,
    )
    .join("");

  $("#column-options").innerHTML = COLUMNS.map(
    (c, i) => `<label class="menu__option"><input class="checkbox" type="checkbox" name="column" value="${c.key}" checked${c.key === "name" ? " disabled" : ""}${i === 1 ? " data-autofocus" : ""}/><span>${columnLabel(c, { previous: "previous quarter" })}</span></label>`,
  ).join("");
}

/* ---------- Disclosure: menus and the panel ---------- */
const target = (button) => document.getElementById(button.getAttribute("aria-controls"));
const openButtons = () => [...document.querySelectorAll('[aria-controls][aria-expanded="true"]')];

function setOpen(button, open) {
  button.setAttribute("aria-expanded", String(open));
  const el = target(button);
  el.hidden = !open;
  if (el.id === "entity-panel") {
    state.openId = open ? button.dataset.entity : null;
    document.querySelectorAll("[data-row]").forEach((tr) => tr.toggleAttribute("data-open", tr.dataset.row === state.openId));
  }
  if (open) el.querySelector("[data-autofocus]")?.focus({ preventScroll: true });
}

function closeAll(except) {
  for (const button of openButtons()) if (button !== except) setOpen(button, false);
}

function closeAndReturn(id) {
  const button = openButtons().find((b) => b.getAttribute("aria-controls") === id);
  if (!button) return;
  setOpen(button, false);
  button.focus();
}

function openEntity(button) {
  closeAll(button);
  const entity = rows.find((r) => r.id === button.dataset.entity);
  $("#entity-panel").innerHTML = renderPanel(entity, state.asOf, QUARTERS);
  setOpen(button, true);
}

/* ---------- Events ---------- */
document.addEventListener("click", (event) => {
  const t = event.target;

  const close = t.closest("[data-close]");
  if (close) return closeAndReturn(close.dataset.close);

  // A click anywhere on a row opens that entity, the name button is the keyboard path.
  const rowEl = t.closest("[data-row]");
  const entityButton = t.closest("[data-entity]") ?? rowEl?.querySelector("[data-entity]");
  if (entityButton) {
    if (entityButton.getAttribute("aria-expanded") === "true") return closeAndReturn("entity-panel");
    return openEntity(entityButton);
  }

  const toggle = t.closest("[aria-controls][aria-expanded]");
  if (toggle) {
    const opening = toggle.getAttribute("aria-expanded") !== "true";
    closeAll(toggle);
    return setOpen(toggle, opening);
  }
  if (!t.closest(".menu, .panel")) closeAll();

  const filter = t.closest("[data-filter]");
  if (filter) {
    state.filter = filter.dataset.filter;
    return render();
  }

  const sort = t.closest("[data-sort]");
  if (sort) {
    const key = sort.dataset.sort;
    const textual = ["name", "country", "currency", "role"].includes(key);
    state.sort =
      state.sort.key === key
        ? { key, dir: state.sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: textual ? "asc" : "desc" };
    return render();
  }

  const group = t.closest("[data-group]");
  if (group) {
    const name = group.dataset.group;
    state.collapsed.has(name) ? state.collapsed.delete(name) : state.collapsed.add(name);
    return render();
  }

  if (t.closest("#export")) exportCsv();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const open = openButtons().pop();
  if (open) closeAndReturn(open.getAttribute("aria-controls"));
});

document.addEventListener("change", (event) => {
  const { name, value, checked } = event.target;
  if (name === "period") {
    state.asOf = Number(value);
    closeAndReturn("period-menu");
    render();
  }
  if (name === "group") {
    state.groupBy = value;
    state.collapsed.clear();
    closeAndReturn("group-menu");
    render();
  }
  if (name === "column") {
    checked ? state.hidden.delete(value) : state.hidden.add(value);
    render();
  }
});

// Country filter applies on Apply; Clear resets it straight away.
$("#country-menu").addEventListener("submit", (event) => {
  event.preventDefault();
  const checked = [...event.target.querySelectorAll('[name="country"]:checked')].map((i) => i.value);
  state.countries = new Set(checked);
  closeAndReturn("country-menu");
  render();
});
$("#country-menu").addEventListener("reset", () => {
  state.countries.clear();
  render();
});

/* ---------- Export the current view as CSV ---------- */
function exportCsv() {
  const header = ["Entity ID", "Name", "Country", "City", "Role", "Tested metric", "Policy min %", "Policy max %", "Margin %", "Status"];
  const lines = visibleRows().map((r) =>
    [r.id, r.name, r.country, r.city, r.role, r.metric, r.min, r.max, r.current ?? "", r.status].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `norrvik-${QUARTERS[state.asOf]}.csv`,
  });
  link.click();
  URL.revokeObjectURL(link.href);
}

buildMenus();
render();
