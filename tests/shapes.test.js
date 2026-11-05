"use strict";
// M2 pivot shapes: cross-tab, Excel compact pivot, hierarchy, multi-sheet, flat data, messy data.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadDV, analyzeSample } = require("./helpers");

const ctx = loadDV();
const DV = ctx.DV;
const arr = (x) => [...x];
const measures = (t) => arr(t.columns.filter((c) => c.role === "measure").map((c) => c.label));
const types = (t) => arr(DV.recommender.catalog(t).map((c) => c.type));

test("cross-tab: years across the top, Grand Total row and column", () => {
  const [s] = analyzeSample(ctx, "crosstab_pivot.xlsx");
  assert.equal(s.tables.length, 1);
  const t = s.tables[0];
  assert.deepEqual(arr(t.dimensionLabels), ["Channel"]);
  assert.deepEqual(measures(t), ["2022", "2023", "2024", "2025"]);
  assert.equal(t.columns.find((c) => c.label === "Grand Total").role, "total", "total column is not a series");
  assert.equal(t.meta.structure, "crosstab");
  assert.equal(t.rows.length, 6);
  assert.ok(t.totals.grand);
  assert.equal(s.reconcile.mismatches.length, 0);
  const cat = types(t);
  for (const ty of ["lines", "stacked", "stacked100", "heatmap"]) assert.ok(cat.includes(ty), ty);
  assert.equal(s.title, "Spend by Channel and Year", "lone table's banner becomes the dashboard title");
});

test("Excel compact pivot: filter area, Sum of …, Column/Row Labels, (blank), totals", () => {
  const [s] = analyzeSample(ctx, "compact_pivot.xlsx");
  assert.deepEqual(arr(s.params.map((p) => p.label + "=" + p.display)), ["Region=(All)"]);
  const t = s.tables[0];
  assert.equal(t.title, "Sum of Amount");
  assert.deepEqual(measures(t), ["Q1", "Q2", "Q3", "Q4"]);
  assert.equal(t.columns.find((c) => c.label === "Grand Total").role, "total");
  assert.ok(t.rows.some((r) => r.label === "(blank)"), "(blank) is a real member");
  assert.equal(t.rows.length, 5);
});

test("hierarchy: parent labels filled down, subtotals kept out of rows", () => {
  const [s] = analyzeSample(ctx, "hierarchical_pivot.xlsx");
  const t = s.tables[0];
  assert.deepEqual(arr(t.dimensionLabels), ["Region", "Category"]);
  assert.equal(t.rows.length, 9);
  assert.equal(t.totals.subtotals.length, 3);
  assert.ok(t.rows.every((r) => r.parent && !/total/i.test(r.label)));
  assert.equal(t.rows[1].label, "East › Software");
  assert.equal(t.meta.structure, "hierarchy");
  assert.ok(types(t).includes("sunburst"));
});

test("multi-sheet: every sheet parsed with its own tables", () => {
  const sheets = analyzeSample(ctx, "multi_sheet.xlsx");
  assert.deepEqual(arr(sheets.map((s) => s.name)), ["2025", "2026"]);
  for (const s of sheets) { assert.equal(s.tables.length, 1); assert.deepEqual(measures(s.tables[0]), ["Budget", "Actual"]); }
});

test("flat data: raw rows stay data-only; summed summaries carry the charts", () => {
  const [s] = analyzeSample(ctx, "flat_sales.xlsx");
  assert.equal(s.mode, "flat");
  const raw = s.tables[0];
  assert.equal(raw.meta.structure, "flat");
  assert.equal(raw.rows.length, 600);
  assert.deepEqual(types(raw).sort(), ["dropdown", "filterPane", "table"]);
  const sums = s.tables.filter((t) => t.meta.virtual);
  assert.deepEqual(arr(sums.map((t) => t.dimensionLabels[0])).sort(), ["Month", "Product", "Region"]);
  const rawRevenue = DV.utils.sum(raw.rows.map((r) => r.values.Revenue));
  for (const t of sums) assert.ok(DV.utils.approxEqual(t.totals.grand.Revenue, rawRevenue), `${t.title} total = sum of raw rows`);
  const month = sums.find((t) => t.dimensionLabels[0] === "Month");
  assert.equal(month.rows.length, 12);
  assert.ok(types(month).includes("trend") && types(month).includes("dateRange"));
  assert.equal(month.rows[0].label, "2025-01", "months stay in time order");
});

test("messy data: padded text, numbers as text, dash, merged title", () => {
  const [s] = analyzeSample(ctx, "messy.xlsx");
  const t = s.tables[0];
  assert.equal(t.title, "Messy Report");
  assert.deepEqual(arr(t.rows.map((r) => r.label)), ["Widgets", "Gadgets", "Gizmos", "Doohickeys"]);
  assert.deepEqual(arr(t.rows.map((r) => r.values.Amount)), [1234, 50, -500, 2000]);
  assert.equal(t.rows[2].values.Share, null, "a dash is empty, not zero");
  assert.ok(DV.utils.approxEqual(t.rows[0].values.Share, 0.12));
});

test("every chart offered for every new shape builds", () => {
  const theme = { id: "t", design: "thesight", mode: "light", style: { bar: "solid", radius: 4, glow: 0, outline: false, smooth: true },
    series: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"], surface: "#ffffff", text: "#000000", text2: "#333333",
    muted: "#555555", grid: "#eeeeee", axis: "#cccccc", border: "#999999", markBorder: "#000000", accent: "#FACC15", highlight: "#FACC15", over: "#cc0000",
    under: "#0000cc", neutral: "#dddddd", other: "#aaaaaa", tooltipBg: "#fff", tooltipText: "#000", font: "sans-serif", fontNum: "sans-serif", texture: false, reducedMotion: true };
  let built = 0;
  for (const f of ["crosstab_pivot.xlsx", "compact_pivot.xlsx", "hierarchical_pivot.xlsx", "multi_sheet.xlsx", "flat_sales.xlsx", "messy.xlsx"]) {
    for (const s of analyzeSample(ctx, f)) for (const t of s.tables) for (const it of DV.recommender.catalog(t)) {
      if (it.dom) continue;
      const view = DV.filters.view(t, DV.filters.empty(), { measure: it.measure || it.actual });
      assert.doesNotThrow(() => DV.charts.buildOption(t, it, { theme, view, highlight: null, custom: {}, sortMode: "value" }), `${f} ${it.id}`);
      built++;
    }
  }
  assert.ok(built > 60, `built ${built}`);
});
