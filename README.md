# TheSight2.0: Excel → interactive dashboard

`dist/TheSight2.0.html` is the whole app in **one file**. Double-click it: it runs offline in Chrome or Edge, with no install, no server and no internet.
Drop in a workbook and TheSight finds every table, title, header, Grand Total and parameter (e.g. `Fiscal Year: 2026`). It suggests charts, and **you pick the ones you want**.
**Your data never leaves your computer.** The page blocks all network access.

New here? Read the **[User Guide](docs/USER_GUIDE.md)**.

## What it understands

| Your sheet looks like… | What TheSight does |
|---|---|
| Several summary tables side by side / stacked, with Grand Total rows | Detects each one; totals feed KPIs and are never plotted as bars |
| Cross-tab (members × years/quarters, total column) | Lines across columns, stacked bars, heatmap; the total column stays out of the series |
| Excel PivotTable (compact form: `Row Labels`, `Sum of …`, `(blank)`) | Title from the caption; filter cells become context chips |
| Hierarchy (parent printed once, `East Total` subtotals) | Fills parents down, keeps subtotals out, offers a sunburst |
| Several sheets (e.g. 2025 / 2026) | One page per sheet plus a **Compare** page (totals side by side with % change); any page can use any sheet |
| Flat data (one header, thousands of rows) | Keeps the raw rows for the data table and builds summed summaries per category and per month, with a trend line |
| Messy cells (`"1,234"`, `"$50"`, `"(500)"`, `-`, padded text) | Cleaned automatically |

If something was detected wrong, **Review** (`R`) shows the sheet with each table outlined. You can fix the header row, total row, split or merge tables, or draw a table that was missed.

## Building a dashboard

1. **Pick your charts:** a gallery of live previews. Each table gets bars, KPI tiles, rings, gauges, donut, treemap, waterfall, trend, sunburst, filters, button bars and data tables. The recommended ones are pre-ticked.
2. **Pages and sections are yours:** add, rename, duplicate, reorder and delete **pages** (tabs above the dashboard; a multi-sheet workbook starts with one page per sheet plus a Compare page). Each page has its own sections, and every page can use data from any table on any Excel sheet. **Sections:** any section can mix charts, KPIs, filters and images from any table. Use **Add section**, **Add charts / Add KPI / Add filter / Add image**, and **Move to…**.
3. **Resize** any card by dragging its corner (any width on a 12-column grid, any height).
4. **Design** (`T`): pick a look.
   - TheSight (brand)
   - Executive, Banking Gold, Terracotta Estate, Plum Retail (styled after Power BI community dashboards)
   - Neon, Bento Soft, Neubrutalism, Classic

   You can also add a background photo and a logo. **Layout** (`L`) rearranges everything.
5. **Edit** (`E`): reorder, rename, icons, section backgrounds, hide, duplicate. `Ctrl+Z` undoes anything.
6. **Export:** a dashboard-only `.html` preview where viewers can only filter, plus **More → Download all tables (.xlsx)**, per-table CSV, chart PNG, and Print → PDF.

**Filters cover the whole page:** a filter on "Scope" (from any filter card, chart click or the sidebar) filters every table on that page that has a Scope column. Tables without it show "Not filtered by Scope". Each page keeps its own filters.

Filters never invent numbers. Pre-aggregated tables are shown or hidden member by member, with readouts like "Selected 5 of 14 campaigns: 38% of Grand Total".

## For developers

```bash
npm install          # dev only: pinned SheetJS 0.20.3 + ECharts 6.1.0
npm run vendor       # copy the libraries into vendor/ (committed; builds then work offline)
npm run gen-samples  # regenerate samples/*.xlsx
npm test             # 77 tests: structure, shapes, chart catalog, export, WCAG contrast
npm run build        # → dist/TheSight2.0.html (≈2.5 MB); fails on any network reference
npm run dev          # rebuild on change
```

- Modules are plain scripts on a global `DV` namespace, loaded in the order in `src/order.json`.
- The pipeline is pure and has no DOM access, so tests run it in Node. It covers `structure/*`, `profiler`, `filters`, `recommender`, `charts/*` and `page`.
- See `CLAUDE.md` for the full spec and the status of each milestone.

**Add a design:**
1. Create `src/styles/designs/<name>.css` with `[data-variant="<name>-light"] { --bg … --series-1..8 --over --under }`.
2. Add the file to `CSS_FILES` in `build.js`.
3. Register it in `src/js/designs.js` with its variants and a `chart` style.
4. Validate the palette with the dataviz skill's `validate_palette.js`.
5. Run `npm test`.

**Add a layout:**
1. Add an entry to `LAYOUTS` in `src/js/layouts.js`.
2. Point its `kind` to a renderer in `src/js/views.js`.

**Not yet covered:**
- **Browsers:** Firefox and Safari haven't been tested.
- **Multi-row (grouped) column headers:** basic support only.
- **Stretch goals:** reading real PivotTable caches, and exporting the whole dashboard as one PNG.
