# Norrvik TP Monitor

Monitoring view for Norrvik Group's transfer pricing: which entities are outside their policy range, which way they are trending, where data is missing, and what needs action before year-end.

Plain HTML, CSS and a little JavaScript, served by [Vite](https://vite.dev). No framework, no CSS tooling.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/ (what Vercel deploys)
```

## Structure

```
index.html               static shell: header, filters, empty table, panel
norrvik_dataset.json     quarterly actuals per entity (the only data source)
public/icons.svg         icon sprite: <svg class="icon"><use href="/icons.svg#close"/></svg>
public/flags/            country flags exported from the Figma library
src/data.js              pure functions: status, trend, gaps, year outlook, summary
src/render.js            HTML templates, one per Figma component; COLUMNS config
src/main.js              state, events, filtering, sorting, grouping, panel, CSV export
src/styles/
  tokens.css             the only file with raw values; mirrors the Figma variables
  base.css               reset, typography, focus ring
  layout.css             .page, .stack, .cluster
  components.css         one block per Figma component
```

## How the data flows

`state` (as-of quarter, filters, grouping, sort, open entity) → `entities(asOf)` derives every row from the JSON → `render()` writes KPIs, table and panel. Nothing is stored twice; changing any control just re-renders.

## Rules (all in `src/data.js`)

| Concept | Rule |
| --- | --- |
| Out of range | Margin below the policy minimum or above the maximum |
| Near limit | Inside the range but within 25% of its width from an edge (0.5 pp on a 2–4% range) |
| Stale data | Latest quarter not reported, older actuals exist |
| Trend / Vs previous | Compared with 4 quarters ago / the previous quarter. Moves under 0.1 pp are Stable; otherwise Recovering if the margin moved toward the middle of the range, Drifting if away |
| FY projection | Year-to-date quarters plus the remaining quarters held at the latest reported level |
| Group trend | Share of reporting entities inside their range, per quarter |

## Decisions

- **Tokens are the source of truth.** `tokens.css` mirrors the Figma "Starter tokens" collection one-to-one (`color/text/primary` → `--color-text-primary`), and each Figma variable has that name as its code syntax. Every other file uses `var(--…)` only.
- **Variants are data attributes.** `data-status="out-of-range"`, `data-tone="danger"`, `data-trend="drifting"`. Rendered data sets state directly; no class juggling.
- **Native elements first.** Real `<table>` with `aria-sort`, `<dl>` for metrics and details, `<form>` + `<fieldset>` for filter menus, native checkboxes with `accent-color`.
- **One disclosure pattern.** Menus and the entity panel are buttons with `aria-controls` + `aria-expanded`. Escape or clicking outside closes them and returns focus.
- **Visible focus everywhere.** A single `:focus-visible` outline in the brand colour, keyboard only.
- **Colour is never the only signal.** Badges carry a word, trends carry a label, the range bar has an `aria-label`.

## Deploy

Push to GitHub, import the repo in Vercel. Vite is detected automatically (build `npm run build`, output `dist`).
