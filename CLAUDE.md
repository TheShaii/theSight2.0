# CLAUDE.md — TheSight2.0: Excel → Interactive Dashboard

## 1. Project Summary

Build a **single standalone HTML file** (`TheSight2.0.html`) that runs by double-clicking it on any computer (Windows, macOS, Linux, Chromebook), with **no internet, no server, no install**.

The user uploads an Excel file. The tool **automatically** understands its structure and analyzes the data, then shows a **gallery of suggested charts** (live previews, recommended ones pre-ticked). The user ticks what they want and the dashboard is built from exactly those. They never configure axes by hand. They pick from **designs** and **layouts** and the dashboard re-renders instantly. A finished dashboard can be **exported as a standalone, still-interactive .html**.

**Primary input type: pivot-style / summary-table workbooks.** The user's files are *already aggregated*: one sheet typically holds **several small tables** (side by side and stacked), each with a title banner, a header row, body rows, and a **Grand Total** row, plus loose parameter cells such as `Fiscal Year: 2026`. The tool must handle this natively. It is **not** a "flat table with one header row" tool. Flat tables are supported as a secondary mode (section 5.9).

**Guiding principle:** *Upload → structure detected correctly → pick charts from a gallery → instantly beautiful → tweak by clicking, never by configuring.*

### 1.1 Brand: TheSight2.0
- Name **TheSight2.0**; logo `docs/logo.png` (inlined at build) shown next to the name, upper-left.
- Palette: navy `#0B1220`, yellow `#FACC15`, white `#FFFFFF`.
- The **top bar is always navy with a yellow bottom line**, in every design.
- **Yellow marks highlights** (active tab, primary buttons, progress, drag guides, selected member, picked gallery cards) and is **never text on white**. Accent-colored text uses `--accent-text` (navy on light, yellow on dark). Enforced by `tests/contrast.test.js`.
- Dark mode uses navy backgrounds with yellow accents.

---

## 2. Hard Constraints (Non-Negotiable)

1. **One file, fully self-contained.** All JS, CSS, fonts, and icons are inlined in `dist/TheSight2.0.html`. No CDN links, no external requests. It must work offline from `file://`.
2. **No backend.** All parsing and rendering happens in the browser. Data never leaves the user's machine. Say this in the UI ("Your data stays on your computer").
3. **No build tooling required to *use* it.** A build script produces the output; the output is a plain `.html` file.
4. **Works in current Chrome, Edge, Firefox, Safari.** Test on `file://`.
5. **Handles real-world files:** many blocks per sheet, many sheets, and (in flat mode) up to ~50,000 rows. Degrade gracefully and tell the user.
6. **No `localStorage` dependence for core function.** If used for remembering theme/layout, wrap every access in `try/catch` and work fine without it.
7. **Accessible and responsive:** keyboard navigable, **WCAG AA contrast in every theme** (≥4.5:1 text; ≥3:1 for UI accents, focus ring, the primary series color and the over/under variance pair; verified by `tests/contrast.test.js`. Other categorical slots may sit below 3:1 on light surfaces, so every chart must also have its data-table view and a legend: the "relief rule"), usable on a laptop and a tablet. Charts are canvas, so enable ECharts `aria` and keep the data table as the accessible equivalent of every chart.
8. **Never silently guess wrong.** If structure detection is uncertain, show the user what was detected and let them fix it in one click (section 5.7).

---

## 3. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Excel parsing | **SheetJS (xlsx.full.min.js)** | Reads `.xlsx`, `.xls`, `.xlsm`, `.csv`, `.ods`. Use `cellNF`, `cellDates`, `cellStyles` options (see 5.2) |
| Unzip (stretch) | **JSZip** | Only for reading real Excel PivotTable caches (5.8) |
| Charts | **Apache ECharts** | Rich interactivity, built-in theming |
| UI | **Vanilla JS + CSS variables** | No framework |
| Fonts | System font stack, optional inlined base64 woff2 | Never load from Google Fonts |
| Icons | Inline SVG | |
| Build | Small Node script (`build.js`) | Inlines libs + CSS + JS into one HTML file |

Vendor library files into `/vendor` (committed) so builds work offline. Pin exact versions:
- **SheetJS 0.20.3** from the official tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (the npm-registry `xlsx` package is stale at 0.18.5, so don't use it).
- **ECharts** at an exact pinned version (see `package.json`).
- Use **`XLSX.SSF.format`** for Excel number formats instead of writing a formatter. Only add a small parser to detect `[Red]` sections.

---

## 4. Repository Structure

```
/
├── CLAUDE.md
├── README.md
├── package.json
├── build.js                  # Inlines everything → dist/TheSight2.0.html
├── vendor/
│   ├── xlsx.full.min.js
│   ├── jszip.min.js          # stretch goal only
│   └── echarts.min.js
├── src/
│   ├── index.template.html
│   ├── styles/
│   │   ├── base.css
│   │   ├── themes.css
│   │   └── layouts.css
│   └── js/
│       ├── main.js           # App bootstrap and state
│       ├── loader.js         # Upload, drag-drop, SheetJS → raw grid
│       ├── structure/
│       │   ├── grid.js       # Normalize sheet → 2D grid with merges, formats, styles
│       │   ├── blocks.js     # Find table blocks on a sheet
│       │   ├── classify.js   # Title / header / body / total rows & columns
│       │   ├── params.js     # Parameter (label: value) cells & sheet titles
│       │   ├── tables.js     # Build the normalized Table model
│       │   ├── flat.js       # Flat data → summed summary tables
│       │   ├── analyze.js    # Pipeline orchestrator (+ review overrides)
│       │   └── reconcile.js  # Totals checks across tables
│       ├── profiler.js       # Column roles, formats, derived/variance detection
│       ├── recommender.js    # Decides which charts to generate per table + overview
│       ├── charts/           # core, bars, kpi, more: ECharts option builders
│       ├── filters.js        # Filter engine (summary-mode semantics)
│       ├── filtercards.js    # Filter cards: pane, dropdown, buttons, ranges, button bars
│       ├── page.js           # User sections (customizations.page)
│       ├── icons.js          # Icon library + picker
│       ├── media.js          # Photos: image cards, backgrounds, logo
│       ├── cards.js / dashboard.js / views.js  # Cards, sections, layout renderers
│       ├── review.js         # "Detected structure" review screen
│       ├── layouts.js        # Layout registry
│       ├── designs.js        # Design registry (+ chartStyle per design)
│       ├── gallery.js        # "Pick your charts" step
│       ├── export.js         # Standalone interactive .html export
│       └── utils.js
├── scripts/
│   ├── vendor.js             # Copies pinned libs from node_modules → vendor/
│   └── make-samples.js       # Generates every samples/*.xlsx deterministically
├── samples/
│   ├── *.expected.json       # Golden expected detection per sample (tests compare against these)
│   ├── sample_multiple_pivot_tables_dashboard.xlsx   # REFERENCE FILE (see 5.1)
│   ├── crosstab_pivot.xlsx       # rows × columns matrix with Grand Total row + column
│   ├── hierarchical_pivot.xlsx   # multi-level row labels, subtotals
│   ├── multi_sheet.xlsx          # several sheets, several blocks each
│   ├── flat_sales.xlsx           # classic flat table (secondary mode)
│   └── messy.xlsx                # merged cells, blank rows, numbers as text
├── tests/
│   └── structure.test.js     # Asserts expected detection on every sample
└── dist/
    └── TheSight2.0.html      # THE DELIVERABLE (generated)
```

---

## 5. Input Model: Reading Pivot-Style Workbooks (CORE REQUIREMENT)

### 5.1 The reference file

`samples/sample_multiple_pivot_tables_dashboard.xlsx` is the canonical example (invented demo data, generated by `scripts/make-samples.js`). It has **one sheet** ("Budget Dashboard", range `A1:M38`) laid out like this:

```
Row 1   A1:L1 (merged)  SHEET TITLE      "MARKETING BUDGET & SPEND — DEMO DASHBOARD"
Row 2   A2:L2 (merged)  SUBTITLE / NOTE
Row 4   A4 "Fiscal Year"  B4 2026         ← PARAMETER (label + value), not a table
Row 6   A6 banner  "BUDGET AND SPEND BY CAMPAIGN"      I6 banner "BUDGET AND SPEND BY DEPARTMENT"
Row 7   header A7:G7  (Campaign, Budget, Committed, Invoiced, Actual Cost, Paid, Budget vs Actual)
        header I7:M7  (Department, Budget, Actual Cost, Paid, Budget vs Actual)
Rows 8–21  14 campaign rows      Rows 8–13  6 department rows
Row 22  "Grand Total" (A22:G22)  Row 14 "Grand Total" (I14:M14)
Rows 23–25 blank
Row 26  banner A26 "PAST CAMPAIGN SEASONS — SPEND BY PHASE"     I26 "AGENCY SPEND — TOP DEMO AGENCIES"
Row 27  header A27:F27 (Phase, Budget, Committed, Invoiced, Actual Cost, Paid)   header I27:L27 (Agency, Committed, Invoiced, Actual Cost)
Rows 28–30 Phase 1, Phase 2, Phase 3   Rows 28–37 10 agencies
Row 31  "Grand Total"            Row 38 "Grand Total"
```

**Expected detection (this is an acceptance test):**

| # | Title | Range | Dimension | Measures | Body rows | Total row |
|---|---|---|---|---|---|---|
| 1 | Budget and Spend by Campaign | A7:G22 | Campaign | Budget, Committed, Invoiced, Actual Cost, Paid, Budget vs Actual | 14 | row 22 |
| 2 | Budget and Spend by Department | I7:M14 | Department | Budget, Actual Cost, Paid, Budget vs Actual | 6 | row 14 |
| 3 | Past Campaign Seasons — Spend by Phase | A27:F31 | Phase | Budget, Committed, Invoiced, Actual Cost, Paid | 3 | row 31 |
| 4 | Agency Spend — Top Demo Agencies | I27:L38 | Agency | Committed, Invoiced, Actual Cost | 10 | row 38 |

**Title rule:** a table's title is its banner text converted to Title Case (small words such as *and, by, of, the* stay lowercase unless first). Dashes are kept, including em dashes. **Range rule:** `range` runs from the header row to the total row (or the last body row). The banner row is excluded and stored separately as `titleCell`.

Plus: sheet title + subtitle captured as dashboard heading/description; parameter `Fiscal Year = 2026` captured as a context chip; **Grand Total rows are never plotted as data**.

Things in this file that commonly break naive parsers, and must work:
- **Side-by-side tables** separated by one blank column (H); **stacked tables** separated by blank rows (23–25). Tables have **different heights and different column sets**.
- **Merged title cells** spanning across more than one table (A1:L1). Treat as sheet title, never as a block or header.
- **Banner rows**: a single styled cell above the header, acting as the table's title.
- **Loose parameter cells** (`Fiscal Year | 2026`) sitting above the tables.
- **Grand Total rows** that must be excluded from charts but used for KPIs and reconciliation.
- **Floating-point noise** (`98765.429999999993`). Keep raw values for math; round to display precision (use the cell's number format, e.g. 2 decimals) for display; compare totals with a tolerance (±0.01 absolute or 1e-9 relative).
- **Number formats** like `#,##0.00;[Red]\(#,##0.00\);\-`: honor the format (negatives in red parentheses, zero as dash), and use it as a hint that the column is a currency-like amount.
- **Derived columns**: `Budget vs Actual` equals `Actual Cost − Budget` (verify arithmetically per row). Positive means over budget.

### 5.2 Pipeline

Run these stages in order. Each is a separate, testable module.

**Stage 1. Read the grid (`grid.js`).**
Use SheetJS with `{cellDates:true, cellNF:true, cellStyles:true}`. Build a 2D array per sheet from `ws['!ref']` where each cell keeps `{v, w, t, z, s?}` (raw value, formatted text, type, number format, style if available). Read `ws['!merges']` and mark merged cells (value lives in the top-left cell; do not blindly fill down merged *titles*). Use cached formula values (`v`); if a formula cell has no cached value, warn the user ("open and re-save in Excel"). **Do not depend on styling being available**: SheetJS community build exposes styles unreliably, so style (bold, fill) is only a *tie-breaker hint*; structure and content drive all decisions.

**Stage 2. Find blocks (`blocks.js`).**
Find rectangular regions of non-empty cells separated by **at least one fully blank row or fully blank column** (within the candidate region). Algorithm: flood-fill connected components of non-empty cells (4-connected), then merge components that are clearly one table (e.g. a table with an isolated blank cell inside, or a banner cell sitting directly above a header row). Do **not** bridge a one-column or one-row gap between components that each look like complete tables. That is exactly how side-by-side and stacked tables are separated in the reference file. Components spanning merged cells wider than the block (A1:L1) are sheet-level titles. Then compute each block's tight bounding box.

**Stage 3. Classify rows and columns inside each block (`classify.js`).**
- **Banner/title row:** a row with a single non-empty text cell (or merged cell) above a header row.
- **Header row (or rows):** the first row where most cells are non-empty text and the rows below contain numbers in most columns. Support **multi-row headers** (merged cells spanning child columns, e.g. a "2026" cell over "Budget | EAC") by building hierarchical column keys.
- **Body rows:** rows below the header until the total row or block end.
- **Total rows:** row label matches `/^(grand\s+)?total|sub\s*total|overall|sum\b/i` (add other languages as configurable keywords) **or** (language-independent, strongest signal) each numeric cell equals the sum of the body rows above it within tolerance. Mark `kind: "grand"` or `"subtotal"`. The sum test only counts when there are **at least 2 body rows** (in a one-row table the body row trivially equals its total). Skip percent/average/ratio columns, which don't sum.
- **Confidence:** every block gets `confidence` in [0, 1] built from clear header, total confirmed by sum, dimension column present, and consistent column types. If any block on the active sheet scores **below 0.7**, show a visible "Please check detected structure" banner that opens the review screen (5.7). The dashboard is still shown.
- **Total columns** (cross-tabs): last column labelled "Total"/"Grand Total" or equal to the row sum.
- **Dimension column(s):** leftmost column(s) containing mostly text/unique labels. Everything else numeric is a **measure**.

**Stage 4. Capture parameters and titles (`params.js`).**
- Sheet title/subtitle: the merged or single-cell text rows at the top. Use as dashboard title and description.
- **Parameter cells:** a short text label with a single value in the adjacent cell (right or below), outside any block (`Fiscal Year | 2026`, `Region | (All)`, `Currency | USD`). Show them as **context chips** on the dashboard ("Fiscal Year: 2026") and include them in exports. Never chart them. They are *not* live: changing the year in Excel changes the numbers, and this tool just displays the file as uploaded. Say so in a tooltip if the user tries to edit them. If the same workbook has multiple sheets/years, offer a sheet/period selector instead.

**Stage 5. Build the normalized `Table` model (`tables.js`).**
Every block becomes:
```
Table = {
  id, sheet, range: "A7:G22",
  title, dimensionLabels: ["Campaign"],
  columns: [{ key, label, role: "dimension"|"measure", type, numberFormat, unit, derived? }],
  rows: [{ labels: {Campaign: "..."}, values: {Budget: n, ...}, kind: "body" }],
  totals: { grand: {Budget: n, ...}, subtotals: [...] },
  meta: { hasGrandTotal, structure: "list"|"crosstab"|"hierarchy" }
}
```
Body rows go into `rows`; total rows go into `totals` and are **excluded from every chart series** (otherwise charts double count and the Grand Total dwarfs everything). Keep them for KPI cards, share-of-total math, and reconciliation.

**Stage 6. Enrich semantics (`profiler.js`).**
- **Measure types:** currency/amount, count, percent, ratio, duration, using number format + header words. Format large numbers compactly on charts (`4.82M`), full precision in tooltips and tables.
- **Derived/variance columns:** test whether a column equals `A − B` (or `A / B`) of two other columns across all body rows (tolerance applies). If so, flag `derived: {op:"diff", a:"Actual Cost", b:"Budget"}`. Name the sign convention ("Over budget" if positive for EAC − Budget). Offer a one-click **"Positive is good / bad"** flip. Variance columns get **diverging colors** (over vs under) and are never summed with plain measures.
- **Plan-vs-actual pairs:** detect pairs by header vocabulary (Budget/Plan/Target/Forecast vs Actual/Spent/EAC/SES/PO/PR/Cost/Revenue) to drive bullet charts and budget-vs-spend views.
- **Dimension types:** category, ordered category (e.g. `Phase 1, Phase 2, Phase 3`), time (years, months, quarters, dates), geo.

**Stage 7. Reconcile (`reconcile.js`).**
- For each table, verify each measure's body sum equals its Grand Total (tolerance). Flag mismatches visibly ("Campaign table: Budget rows sum to X but Grand Total says Y").
- Across tables, find measures with identical Grand Totals (in the reference file, Budget = 4,820,500 in tables 1–3, Actual Cost = 5,964,312.48 in tables 1, 2, 4). Show a **"Totals reconcile across 4 tables ✓"** badge, and show the shared KPI **once** on the overview. Show a warning badge if they disagree.

**Stage 8. Review screen (`review.js`).** See 5.7.

### 5.3 Other pivot shapes that must also work

- **Real Excel PivotTable output** in compact form: header `Row Labels`, `Column Labels`, `Sum of Amount`, `Count of X`, filter area cells showing `(All)`, `(blank)` category, `Grand Total` row and column.
- **Tabular-form / hierarchical pivots:** multiple label columns where parent labels appear once with blanks beneath (fill down). Also indented single-column hierarchies (detect by indentation level in `cell.s.alignment.indent` or leading spaces). Parent rows with subtotals become **group nodes** in a hierarchy (`rows` with `level`, `parent`). Offer drill-down bars, treemap, and sunburst.
- **Cross-tab / matrix pivots:** a dimension down the side, another across the top, one measure in the cells (e.g. Channel × Year), with optional Grand Total row/column. Offer **heatmap, stacked/grouped bars, small multiples, line chart over the column dimension** if it is time-like.
- **Multi-row column headers** (grouped measures). Let the user pick which header level is the series and which is the facet.
- **Percent-of-total tables** (columns summing to 100%): detect and use as composition (stacked 100% bars, donuts).
- **Blank/dash cells** (`-`, `—`, `n/a`, empty) in numeric columns: treat as null, not zero, unless the format shows the dash for zero (like `...;\-`), in which case treat as 0.

### 5.4 Multiple sheets

Parse every non-empty sheet. Show a **sheet selector** (tabs). Each sheet gets its own detected tables, title, and parameters. Offer an **"All sheets overview"** that lists KPIs per sheet when sheets look like periods/scenarios (same table titles repeated), and a **compare** view across such sheets (e.g. 2025 vs 2026 for the same table).

### 5.5 Dirty-data tolerance

Trim whitespace, normalize non-breaking spaces, parse numbers stored as text (`"1,234"`, `"$50"`, `"12%"`, `"(500)"` as −500), convert Excel serial dates, ignore fully empty rows/columns, and ignore decorative cells (borders, fills with no content). Show friendly messages for corrupt or password-protected files. Never blank-screen.

### 5.6 Mode detection

After Stage 3, decide automatically:
- **Summary mode** (default for the user's files): ≥1 block with a Grand Total row/column, or several small blocks, or hierarchy/cross-tab shapes.
- **Flat mode**: a single large block with one header row, many rows, no totals (section 5.9).
Show which mode was chosen, with a one-click switch.

### 5.7 "Detected structure" review screen (trust builder)

Before (or immediately after) the dashboard appears, offer a view of the sheet as a grid with each detected block **outlined in its own color** and labeled (title, range, dimension, measures). Parameters and sheet titles are tagged. Total rows are highlighted. The user can, with a click:
- rename a table, hide it, or mark it "not a table",
- **change the header row** or the **total row**,
- **split** a block or **merge** two blocks,
- mark a column as dimension/measure, or flip a measure's sign meaning,
- drag-select a range and say "this is a table" for something missed.

Changes re-run only Stages 5–7. The first dashboard is always shown without requiring this step (auto first); a small "Detected 4 tables · Review" pill opens it. The pill turns into a warning when any block's confidence is below 0.7 (Stage 3).

### 5.8 Stretch: real PivotTable caches

If the workbook contains actual Excel PivotTable objects (`xl/pivotTables/*.xml` with `xl/pivotCache/pivotCacheRecords*.xml`), use JSZip to read the cache, which holds the **underlying flat records**. Offer "Use full source data" to unlock true row-level filtering and re-aggregation (flat mode on the recovered records). The reference file has *no* real pivot objects (they are pivot-style ranges), so this must not be assumed or required. If the cache is absent, always fall back to the visible ranges.

### 5.9 Secondary: flat tables

A flat table (one header row, thousands of rows) is still supported: type/role profiling, auto charts (trend, breakdown, composition, distribution, scatter), global row-level filters (category multi-select, numeric range, date range), cross-filtering, paginated table. Flat mode reuses the same layouts, themes, and export code.

---

## 6. Chart Gallery → Dashboard (Summary Mode)

### 6.0 Pick your charts (gallery)
- After upload the user lands on **"Pick your charts"**: every chart that fits each table (the **catalog**, `recommender.catalog`), as live previews grouped by table, with family filters (Bars · KPI · Composition · Other · Tables) and search.
- The **top 2 per table are recommended and pre-ticked**. Nothing reaches the dashboard until **Build dashboard**.
- **Pages** (`customizations.pages = [{ id, title, sections }]`, `activePage`): tabs the user can add, rename, duplicate, reorder and delete. A multi-sheet workbook starts with one page per sheet plus a Compare page. The header and KPIs are computed from the tables used on the page. **Filters are per page** (`state.pageFilters`) and **field-scoped**: `dim:<field>`, `m:<measure>` and `sectionMeasure["*"]` filter every table on the page with that field. Tables without the field are untouched and show "Not filtered by …".
- **Sections are user-defined** (`customizations.page`: `[{ id, title, note, items }]`, helpers in `page.js`). The first build makes one section per table. After that, users add, rename, reorder and delete sections. **Any section can hold items from any table**, including KPI tiles and filters; items keep their own `tableId`. In the gallery the user picks the target section ("Add to …"); per-section buttons are **Add charts**, **Add KPI** and **Add filter**. Cards can be moved between sections.
- **Free sizing:** every card has a drag handle (bottom-right). Width snaps to a **12-column grid** (1–12), height is free (px). Stored as `customizations.charts[id].{w,h}`, with "Reset size" in edit mode. There are no fixed ⅓/½/full presets.
- **Icons** (`icons.js`, ~37 business icons): KPI tiles and the KPI strip get auto icons from the measure name; any chart, filter or section can get one (Icon button in edit mode).
- **Photos** (`media.js`): image cards, dashboard background (dim/blur), section backgrounds, header logo. Uploads are re-encoded through a canvas (max 1600 px, ≤1.5 MB; SVG rasterized) and stored as data URIs in `customizations.assets`. Only referenced images go into exports.
- **Button bars** (`buttonBar`, Filters family): user-defined buttons with label, icon and action: show column (this section or whole dashboard, via `filters.sectionMeasure`), filter to member, Top N, over/under, clear. Includes a ready-made "Measure switcher".
- **Filters family** (filter "charts" placed like any card, `filtercards.js`): filter pane (search + checklist + value range + Top N + over/under), dropdown, slicer-style buttons (≤12 members), range filter (ordered/time dimensions), date range (date dimensions), and value range slider per measure. They write `state.filters` (`range`, `valueRange`, `members`, …), show/hide members only, and are placed above the charts when picked. They're never pre-ticked.
- **Catalog rules, which never show numbers the file doesn't support:**
  - Stacked / 100% stacked only when the profiler proves measures are parts of a whole (`profile.components`).
  - KPI items (big number, variance tile, progress ring, gauge, total-vs-plan bar) only from Grand Total rows.
  - Waterfall only when plan total + Σ variances = actual total.
  - No dual axes; Pareto uses two stacked plots.

### 6.1 Overview strip

- **Title/subtitle** from the sheet, **context chips** from parameters.
- **KPI cards** from Grand Totals (deduplicated across tables): e.g. Budget 4.82M, Actual Cost 5.96M, Paid 2.18M, and a derived headline "Actual Cost is 24% over Budget (+1.14M)". Compute derived KPIs only when the arithmetic is valid for the data.
- **Reconciliation badge** (5.2 Stage 7).

### 6.2 One section per detected table

Each section has the table's title, a short auto-written insight line ("14 campaigns; top 3 account for 40% of Actual Cost"), and several auto-picked charts, ranked by interestingness and fit:

1. **Ranked bars** of the primary measure by dimension (horizontal when labels are long; sorted desc; top N + "Other").
2. **Grouped bars** comparing measures side by side per dimension member (Budget vs Committed vs Invoiced vs Actual Cost vs Paid).
3. **Budget vs actual** bullet/bar-with-marker per member when a plan-vs-actual pair exists.
4. **Variance bars** (diverging, zero baseline) for derived columns like `Budget vs Actual`, colored by over/under.
5. **Composition**: donut or treemap of share of Grand Total (≤ 12 members; else treemap).
6. **Pareto** (bars + cumulative % line) for long-tailed spend tables such as vendors.
7. **Stacked bars** when measures are components of a whole.
8. **Scatter** of two measures (e.g. Budget vs Actual Cost) with a y = x reference line to show over/under at a glance.
9. **Heatmap** of the table (members × measures, column-normalized) for wide tables.
10. **Cross-tab/hierarchy** shapes: heatmap, small multiples, drill-down bars, sunburst.
11. **Data table**: the original table, faithfully reproduced (same number format, Grand Total row pinned and styled), sortable, with conditional-formatting toggle (data bars / color scale).

Rules:
- Show roughly **3–5 charts per table**, never dozens. "More charts" reveals the next ranked ones.
- Every chart has an auto-written title ("Actual Cost by Campaign", "Budget vs Actual variance by Phase").
- Each chart has small controls: **swap type** (among sensible alternatives), **change measure**, **hide**, **fullscreen**.
- Charts always **exclude total rows** from series but may draw the Grand Total as a reference label or line.
- Tables with 3 or fewer members: prefer grouped bars/donut. Tables with one measure: prefer ranked bars. Do not force a chart type that does not fit the data.

---

## 7. Interactive Filters (Summary Mode Semantics)

Pre-aggregated tables **cannot** be filtered row-by-row like raw data. Do not offer filters that would silently produce wrong totals. Instead:

- **Member filter** per table (and a global one when a dimension appears in several tables): searchable multi-select of the dimension members. Selected members are shown; others are dimmed or hidden. Show **"Selected X of Y: Z% of Grand Total"** instead of recomputing a fake total.
- **Top N / Bottom N** slider and **minimum value** threshold per table.
- **Measure picker** (global): choose which measures are shown in all charts that have them (e.g. only Actual Cost and Budget). Charts silently skip tables lacking that measure.
- **Sort control:** by value, by label, by variance, by original Excel order.
- **Variance filter:** "Only over budget" / "Only under budget" when a variance column exists.
- **Search** across all tables' labels.
- **Cross-highlighting:** clicking a member highlights the same-named member in every other table/chart where it exists (useful when dimensions repeat across tables or sheets).
- **Sheet/period selector** (5.4).
- **Active filters** shown as removable chips with "Clear all" and live "showing X of Y members".
- Filtering is instant; no filter ever mutates the source data.

(Flat mode keeps the row-level filters from 5.9: categories, ranges, dates, cross-filtering.)

### 7.5 Interactivity & Customization

The dashboard must feel alive and be shapeable by clicking. Auto-generated output is the starting point, never a locked result.

- **Live charts:** rich tooltips (full value, % of Grand Total, variance), legend toggles, hover emphasis, `dataZoom` on long axes, and brush-select on bars and scatter. **Click** a member to cross-highlight it everywhere, **Shift-click** to add it to that table's member filter, and **double-click** to isolate it.
- **KPI cards:** clicking a card focuses the dashboard on that measure (sets the measure picker). Cards can be chosen, hidden, and reordered.
- **Per-chart ⋯ menu:**
  - swap type (only among types the recommender marks as fitting)
  - change measure(s) or series
  - sort, Top N, value labels, orientation
  - per-chart palette, editable title and caption
  - duplicate, hide, fullscreen, download PNG
- **Edit dashboard mode:** drag-to-reorder cards (with a keyboard equivalent, Alt+↑/↓), card width (⅓, ½, full), hide or restore sections and charts, pin a chart to the overview, **Add chart** from the ranked suggestions not yet shown, and edit the dashboard title and insight text (rendered via `textContent`).
- **Model:** customizations live in `state.customizations`, keyed by stable table and chart ids. They're **layered over** the auto spec and never replace it. **Undo/redo** (Ctrl+Z / Ctrl+Y) uses a state-history stack. **Reset to auto** works per chart, per section, or for the whole dashboard.
- **Saved views:** Save and load the view as a small JSON file (and remember it in localStorage via try/catch). Tables are matched by title and range, so the view can be reapplied to a newer version of the same workbook.
- Customizations never change parsed data or totals. The §7 filter semantics still hold.

---

## 8. Layouts (choose-from options)

Provide **at least 5 layouts**, switchable instantly from a "Layout" picker with visual thumbnails. The same sections/charts, rearranged:

1. **Executive Overview:** KPI row on top, then the tables' sections in a 2-column card grid; filters in a left sidebar.
2. **Table Boards:** one card per detected table (title, mini data table, 2 charts), mirroring the Excel layout, with side-by-side/stacked placement echoing the original sheet positions.
3. **Story / Scroll:** single column, one section per table, large charts with auto-written captions, like a report.
4. **Focus:** one hero chart plus a thumbnail rail of every other chart; filters in a drawer.
5. **Presentation:** one chart (or table) per full-screen slide, arrow keys to navigate, `F` summons filters.
6. **Tabbed** *(optional)*: one tab per detected table, plus an Overview tab and a Data tab.
7. **Bento Grid:** dense grid of mixed-size tiles (a 2×2 hero per table, KPI tiles, full-width tables); the default with the Bento Soft design.

Layouts 1–5 are required; Tabbed is optional.

Layouts are declarative in `layouts.js` (name, thumbnail SVG, grid template, filter placement, sizing rules) so more can be added.

---

## 9. Designs (replace themes)

Each **design** is a full visual system (`src/styles/designs/*.css` + `designs.js` `chartStyle`: fill, glow, radius, outline):

| Design | Variants | Look |
|---|---|---|
| TheSight (default) | Light, Navy | Brand white/navy with yellow highlights |
| Executive | Light, Navy | Navy header band, KPI tiles with colored top edges (after a Power BI post-merger dashboard) |
| Banking Gold | Light, Night | Navy + gold, left-edge KPI cards with icon badges (after a Power BI banking dashboard) |
| Terracotta Estate | Cream | Cream frame, terracotta, serif title (after a DataFlip property dashboard) |
| Plum Retail | Light | Plum header band, round icon badges, plum pills (after a DataFlip retail dashboard) |
| Neon | Cyber, Synthwave | Dark grid, glowing outlines, neon marks, monospace numerals |
| Bento Soft | Soft Light, Soft Dark | Neumorphic tiles; pairs with the **Bento Grid** layout |
| Neubrutalism | Bold, Bold Night | Ink borders, hard offset shadows, flat bold color |
| Classic | Midnight, Sunset, Forest, Ocean, Monochrome (print), High Contrast | The original plain themes |

Every design palette is checked with the dataviz `validate_palette.js` (CVD and normal-vision separation, lightness band). A global **Colorblind-safe** toggle adds texture and a blue/orange variance pair. The design picker shows live mini previews.

### 9.1 Former theme list (kept as the Classic design)

Provide **at least 8 themes**, switchable instantly from a "Theme" picker with swatches. Each defines CSS variables and a matching ECharts theme (palette, background, axis, tooltip, font):

Required (8): Light Clean, Dark Mode, Midnight, Sunset, Forest, Ocean, Monochrome (print-friendly), High Contrast. Optional: Pastel, and Auto (follows `prefers-color-scheme`). Every theme must pass WCAG AA (§2.7).

Also: a **density toggle** (Comfortable/Compact), **corner style** (Rounded/Sharp), and an independent **chart-palette switcher** (Vivid, Muted, Colorblind-safe). Variance charts always use a clearly distinguishable over/under pair in every theme (with a colorblind-safe option). All changes are live and never re-parse data.

---

## 10. Export & Share

- **Export dashboard (.html)** (`export.js`): the app's own single-file document plus one `<script id="dv-embed" type="application/json">` block.
  - The block holds **only the analyzed tables on the dashboard** and the view (board, customizations, filters, design, layout).
  - The raw workbook grid and other sheets and cells are **not** included. JSON is `<`-escaped.
  - The exported file is a **dashboard-only preview**: **no top bar, logo, sidebar, filter bar or search**. The viewer can only filter, using the filter cards placed on the dashboard plus member clicks, brush and KPI focus. Tooltips, full screen and data-table sorting still work. There's no editing, resizing, gallery, design/layout switching, review, downloads or opening other files.
  - The export dialog warns that the file contains the data shown.

- **Single chart as PNG** (ECharts `getDataURL`). **Dashboard as PDF** via a print stylesheet and `window.print()`.
- *Stretch:* whole-dashboard PNG. ECharts only renders individual charts, so this needs a DOM-capture library or a custom canvas compositor. Don't add a dependency for it in M1–M3.
- **Each detected table as CSV** (clean, normalized: header row + body rows, Grand Total as separate optional row) and **all tables as one multi-sheet .xlsx** (SheetJS), so the user can get tidy data out.
- **"Download this dashboard as standalone HTML"** with the parsed tables embedded (nice to have).

---

## 11. Polish

- Subtle transitions on layout/theme switch (respect `prefers-reduced-motion`).
- Rich tooltips (full-precision values, share of Grand Total, variance), legend toggling, hover highlighting, zoom on long axes.
- Loading indicator for big files. Use a Web Worker **only for files over ~5 MB**: it means inlining the SheetJS source a second time as a Blob so it works from `file://`, so smaller files parse on the main thread.
- Friendly empty/error states and a first-run hint ("Drop an Excel file to begin").
- Keyboard shortcuts: `T` theme, `L` layout, `F` filters, `R` review structure, `←/→` presentation, `Esc` close/exit fullscreen.

---

## 12. Architecture Notes

- **Single source of truth:** one `state` object in `main.js`:
  ```
  state = {
    workbook, sheets: [{name, grid, blocks, tables, params, titles}],
    activeSheet, mode: "summary"|"flat",
    structureOverrides,                 // user fixes from the review screen
    filters, selection,                 // member filters, measure picks, cross-highlight
    charts: [{id, tableId, type, spec, visible}],
    customizations,                     // §7.5 user edits layered over auto specs
    history,                            // undo/redo stack
    layoutId, themeId, paletteId, density
  }
  ```
- **Unidirectional flow:** user action → update state → `render()`. Never mutate parsed source data.
- **Pure functions** for structure detection and chart building: `grid → blocks → tables`, `(table, spec, theme) → EChartsOption`. Easy to unit test.
- **Layout and theme are pure presentation.** Switching them never re-parses or re-detects structure.
- Keep each JS module under ~400 lines. Short comments explaining *why*, not *what*.

---

## 13. Build & Run

```bash
npm install          # only for the build script
npm run build        # produces dist/TheSight2.0.html
npm run gen-samples  # regenerates samples/*.xlsx via scripts/make-samples.js
npm run test         # node --test: structure (vs golden JSON) + contrast tests
npm run dev          # optional watch + rebuild
```

`build.js` must: inline `vendor/*.js`, `src/js/**` (dependency order), all CSS, fonts/icons; write `dist/TheSight2.0.html`; print the final size (**target under ~3 MB**). After building, verify there are **zero** `http://` or `https://` resource references.

---

## 14. Coding Conventions

- Vanilla ES2020, `"use strict"`, no transpiler. **No ES modules** (`import`/`export` break when files are concatenated). Each file is a plain script, wrapped in an IIFE, that attaches to the global namespace `DV` (`DV.blocks = {...}`). `build.js` concatenates them in a fixed order, and tests load the same files into a Node `vm` context. Structure/profiler/recommender/chart-builder modules must not touch the DOM.
- **Escape every cell value** before inserting into the DOM (`textContent`, never `innerHTML` with spreadsheet data). Workbooks are untrusted input.
- CSS custom properties for all colors, radii, spacing, sizes. No hardcoded colors outside `src/styles/designs/*.css`.
- Name things by what they are (`findBlocks`, `detectTotalRows`, `inferDerivedColumn`).
- Money math: sum with care (Kahan or round-to-cents per step) and compare using tolerances, never `===` on floats.

---

## 15. Testing Checklist

`npm test` runs 73 tests (`tests/structure`, `catalog`, `shapes`, `export`, `contrast`). Status as of the last commit:

**Structure detection (automated):**
- [x] Reference file yields exactly **4 tables** with the ranges, dimensions, measures, row counts and total rows in the 5.1 table (golden file `samples/sample_multiple_pivot_tables_dashboard.expected.json`).
- [x] Sheet title, subtitle and parameter `Fiscal Year = 2026` are captured and not treated as tables.
- [x] No Grand Total row appears in any chart series (every catalog chart is built and checked).
- [x] `Budget vs Actual` is detected as derived (`Actual Cost − Budget`) and labelled "over budget" when positive.
- [x] Reconciliation: body sums equal Grand Totals; Budget shared across tables 1–3; Actual Cost shared across 1, 2, 4.
- [x] Float noise `98765.429999999993` displays as `98,765.43`.
- [x] Every sample is generated by `scripts/make-samples.js`, and `tests/shapes.test.js` asserts its expected structure. This covers the cross-tab, compact Excel pivot, hierarchy, multi-sheet, flat and messy samples.
- [x] Sum-based total detection is not triggered for one-body-row tables or for percent/average columns.
- [x] `tests/contrast.test.js`: every design variant's text and UI contrast, header-band text, icon badges, the brand rules, and no yellow text on white.
- [x] Compact Excel pivot (`Row Labels`, `Sum of X`, `(blank)`, `Grand Total` row and column) parses correctly.
- [ ] Multi-row (grouped) column headers: basic support only (parent labels joined as `Parent · Child`), no dedicated sample yet.

**App behavior (checked in headless Chrome and Edge from `file://` with the network blocked):**
- [x] Offline single file; no network requests; no console errors across all flows.
- [x] Review screen outlines blocks; rename / not-a-table / header row / total row / split / merge / draw range all re-run detection.
- [x] Designs × layouts screenshots: no unreadable text or overflow; phone (390 px) and tablet (820 px) have no horizontal overflow.
- [x] Interactivity: highlight, Shift/double-click, ⋯ menu, edit-mode reorder, drag-resize, move between sections, undo/redo, saved views.
- [x] Filters (member, Top N, ranges, button bars, measure picker, sort) and the "X% of Grand Total" readout.
- [x] Exports: chart PNG, print/PDF, per-table CSV, multi-sheet XLSX (verified by re-reading the file), standalone dashboard-only HTML.
- [x] Corrupt, empty and one-cell files show friendly messages. Password-protected files are mapped to a friendly message but untested (no sample).
- [ ] Firefox and Safari: not tested (not installed on the build machine).

---

## 16. Definition of Done

**M1 (core): done.** Single offline file; reference workbook detected with zero configuration; reconciliation and variance; summary-mode filters; review screen; layouts and designs; interactivity, customization and sections.

**M2 (shapes): done**, except multi-row headers, which have basic support.
- Cross-tab: year headers, total column, lines across columns.
- Compact Excel pivot.
- Hierarchy: fill-down, subtotals, sunburst.
- Multi-sheet: tabs plus an "All sheets" comparison of repeated reports.
- Flat data: raw table plus summed summaries per dimension and per month, with a trend chart.

**M3 (export & polish): done**, except for Firefox and Safari, which are untested.
- Chart PNG, print/PDF, CSV, multi-sheet XLSX, dashboard-only HTML export.
- Data-table paging.
- Web Worker for files over 5 MB.
- Responsive pass.
- Chrome and Edge checked.

**Not in any DoD (stretch):** real PivotTable cache reading (5.8) and whole-dashboard PNG.

---

## 17. Things to Avoid

- ❌ Assuming one table per sheet, one header on row 1, or contiguous data from A1.
- ❌ Treating a `Grand Total` row as a data point (double counting, a giant bar).
- ❌ Treating title banners, merged title cells, or parameter cells (`Fiscal Year: 2026`) as table headers or data.
- ❌ Bridging blank-column gaps between side-by-side tables, or splitting a table at an isolated blank cell.
- ❌ Row-level filters on pre-aggregated tables that produce fake totals.
- ❌ Depending on cell styling to find structure (it is a hint only).
- ❌ Any CDN, remote font, analytics, or network call.
- ❌ Making the user pick columns/axes before seeing a result. Auto first, customize later.
- ❌ Generating dozens of mediocre charts. Fewer, better, ranked.
- ❌ `innerHTML` with spreadsheet data; heavy frameworks; a server.
- ❌ Using `===` to compare floating-point money totals.

---

## 18. Suggested Build Order

1. `build.js` + template producing a working `dist/TheSight2.0.html` with vendored libs inlined (prove single-file offline first).
2. `grid.js`: SheetJS read into a normalized grid with merges, formats, and cached values. Dump it for the reference file.
3. `blocks.js` + `classify.js` + `params.js` + `tables.js`, driven by `tests/structure.test.js` until the reference file passes exactly.
4. `reconcile.js` and derived-column detection in `profiler.js`.
5. `charts.js` + `recommender.js`: KPI cards, ranked bars, grouped bars, variance, composition, then the rest. Original-table view with pinned total row.
6. Summary-mode `filters.js`.
7. `review.js` (detected-structure screen with fix actions).
8. `layouts.js` + `themes.js` with pickers and live switching.
9. `pivotforms.js`: compact Excel pivots, hierarchical, cross-tab, multi-row headers; then multi-sheet.
10. Flat mode, export, polish, shortcuts, error states, performance.
11. Stretch: real PivotTable cache reading (5.8).
12. Full test checklist and README.

When unsure about a design decision, choose the option that makes the result **look better with less user effort**, and that **never shows a number the file doesn't support**.
