"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadDV, analyzeSample } = require("./helpers");

const ctx = loadDV();
const DV = ctx.DV, X = ctx.XLSX;
const sheet = analyzeSample(ctx, "sample_multiple_pivot_tables_dashboard.xlsx")[0];
const sheetOf = (aoa) => DV.analyze.analyzeSheet("T", X.utils.aoa_to_sheet(aoa));

// A minimal theme so builders can run without a DOM.
const theme = {
  id: "t", design: "thesight", mode: "light", style: { bar: "gradient", radius: 4, glow: 8, outline: true, smooth: false },
  series: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888"],
  surface: "#ffffff", text: "#000000", text2: "#333333", muted: "#555555", grid: "#eeeeee", axis: "#cccccc", border: "#999999",
  markBorder: "#000000", accent: "#FACC15", highlight: "#FACC15", over: "#cc0000", under: "#0000cc", neutral: "#dddddd", other: "#aaaaaa",
  tooltipBg: "#fff", tooltipText: "#000", font: "sans-serif", fontNum: "sans-serif", texture: false, reducedMotion: true,
};
const build = (t, spec) => DV.charts.buildOption(t, spec, { theme, view: DV.filters.view(t, DV.filters.empty(), { measure: spec.measure || spec.actual }), highlight: null, custom: {}, sortMode: "value" });

test("every table offers several bar variants, and 2 recommended charts", () => {
  for (const t of sheet.tables) {
    const cat = DV.recommender.catalog(t);
    const bars = cat.filter((c) => c.family === "bars");
    assert.ok(bars.length >= 4, `${t.title}: ${bars.length} bar items`);
    assert.equal(cat.filter((c) => c.recommended).length, 2, t.title);
    assert.ok(cat.some((c) => c.type === "table"), "data table is selectable");
    assert.equal(new Set(cat.map((c) => c.id)).size, cat.length, "ids are unique");
  }
});

test("every catalog item builds, and no total row ever reaches a series", () => {
  for (const t of sheet.tables) {
    const grandLabel = t.totals.grandLabel;
    for (const it of DV.recommender.catalog(t)) {
      if (it.dom) continue;
      const o = build(t, it);
      const json = JSON.stringify(o);
      assert.ok(!json.includes(`"${grandLabel}"`) || ["stat"].includes(it.type), `${it.id} mentions ${grandLabel}`);
      if (["ring", "gauge", "bulletTotal"].includes(it.type)) continue; // these show Grand Totals by design
      const values = (o.series || []).flatMap((s) => (s.data || []).map((d) => (d && typeof d === "object" && !Array.isArray(d) ? d.value : d)));
      for (const k of Object.keys(t.totals.grand)) {
        const g = t.totals.grand[k];
        if (it.type === "waterfall") continue;
        assert.ok(!values.some((v) => typeof v === "number" && Math.abs(v - g) < 0.005 && Math.abs(g) > 1), `${it.id} plots the grand total of ${k}`);
      }
    }
  }
});

test("stacked bars only when measures are proven components of a whole", () => {
  for (const t of sheet.tables) assert.ok(!DV.recommender.catalog(t).some((c) => c.type.startsWith("stacked")), `${t.title} has no components`);
  const s = sheetOf([["Region", "Labor", "Material", "Total Cost"], ["North", 10, 5, 15], ["South", 20, 7, 27], ["East", 4, 4, 8], ["Grand Total", 34, 16, 50]]);
  const t = s.tables[0];
  assert.deepEqual([...t.profile.components.parts].sort(), ["Labor", "Material"]);
  const stacked = DV.recommender.catalog(t).filter((c) => c.type.startsWith("stacked"));
  assert.equal(stacked.length, 2);
  assert.doesNotThrow(() => build(t, stacked[0]));
});

test("waterfall walks from Budget to Actual Cost and reconciles", () => {
  const t = sheet.tables[0];
  const wf = DV.recommender.catalog(t).find((c) => c.type === "waterfall");
  assert.ok(wf, "offered for the campaign table");
  const o = build(t, wf);
  const base = o.series[0].data, up = o.series[1].data, down = o.series[2].data;
  const steps = up.map((u, i) => (i === 0 || i === up.length - 1 ? 0 : (u ? u.signed : 0) + (down[i] ? down[i].signed : 0)));
  const start = up[0].value, end = up[up.length - 1].value;
  assert.ok(DV.utils.approxEqual(start + DV.utils.sum(steps), end), "start + steps = end");
  assert.ok(DV.utils.approxEqual(start, t.totals.grand.Budget));
  assert.ok(DV.utils.approxEqual(end, t.totals.grand["Actual Cost"]));
  assert.equal(base.length, up.length);
});

test("KPI items read Grand Totals only", () => {
  const t = sheet.tables[0];
  const ring = DV.recommender.catalog(t).find((c) => c.type === "ring");
  const o = build(t, ring);
  const pct = o.series[0].data[0].value;
  assert.ok(Math.abs(pct - (t.totals.grand["Actual Cost"] / t.totals.grand.Budget * 100)) < 0.06);
  const noTotal = sheetOf([["Item", "Budget", "Actual"], ["A", 1, 2], ["B", 3, 1]]).tables[0];
  assert.ok(!DV.recommender.catalog(noTotal).some((c) => c.family === "kpi"), "no Grand Total → no KPI items");
});

test("filter items are offered and never pre-ticked", () => {
  for (const t of sheet.tables) {
    const f = DV.recommender.catalog(t).filter((c) => c.family === "filters");
    const types = f.map((c) => c.type);
    for (const ty of ["filterPane", "dropdown", "valueRange"]) assert.ok(types.includes(ty), `${t.title}: ${ty}`);
    assert.ok(f.every((c) => !c.recommended && c.dom));
  }
  const units = sheet.tables.find((t) => t.dimensionLabels[0] === "Phase");
  assert.ok(DV.recommender.catalog(units).some((c) => c.type === "range"), "Phase 1..3 is ordered → range filter");
});

test("range, date range and value range filters show/hide members only", () => {
  const F = DV.filters;
  const units = sheet.tables.find((t) => t.dimensionLabels[0] === "Phase");
  let f = F.setRange(F.empty(), units.id, { from: "Phase 2", to: "Phase 3" });
  assert.deepEqual([...F.view(units, f).rows.map((r) => r.label)].sort(), ["Phase 2", "Phase 3"]);
  const scope = sheet.tables[0];
  f = F.setValueRange(F.empty(), scope.id, { key: "Actual Cost", min: 500000, max: null });
  const v = F.view(scope, f);
  assert.ok(v.rows.length > 0 && v.rows.every((r) => r.values["Actual Cost"] >= 500000));
  assert.ok(v.share > 0 && v.share < 1, "share of Grand Total, not a new total");
  const months = sheetOf([["Month", "Spend"], ["2024-01-31", 5], ["2024-02-29", 7], ["2024-03-31", 9], ["Grand Total", 21]]).tables[0];
  assert.ok(F.isDateDim(months));
  assert.ok(DV.recommender.catalog(months).some((c) => c.type === "dateRange"));
  f = F.setRange(F.empty(), months.id, { dates: true, from: Date.UTC(2024, 1, 1), to: null });
  assert.deepEqual([...F.view(months, f).rows.map((r) => r.label)], ["2024-03-31", "2024-02-29"]);
  assert.equal(F.describe(f, [months]).length, 1);
});

test("icons: sensible auto-pick; designs: removed Glass migrates", () => {
  const vm = require("vm"), fs = require("fs"), path = require("path");
  for (const f of ["icons.js", "designs.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "js", f), "utf8"), ctx);
  assert.equal(DV.icons.auto("Budget"), "wallet");
  assert.equal(DV.icons.auto("Actual Cost"), "money");
  assert.equal(DV.icons.auto("Vendor"), "truck");
  assert.ok(DV.icons.NAMES.length >= 35);
  assert.equal(DV.designs.variant("glass-dark").id, "exec-dark");
  assert.equal(DV.designs.variant("glass-light").id, "exec-light");
  assert.ok(!DV.designs.DESIGNS.some((d) => d.id === "glass"));
});

test("button bars: measure switcher offered; show-column switch is a pure filter", () => {
  const scope = sheet.tables[0];
  const bb = DV.recommender.catalog(scope).filter((c) => c.type === "buttonBar");
  assert.deepEqual([...bb.map((c) => c.variant)].sort(), ["custom", "measures"]);
  assert.ok(bb.every((c) => !c.recommended && c.family === "filters"));
  let f = DV.filters.setSectionMeasure(DV.filters.empty(), "sec-1", { key: "budget", label: "Budget" });
  assert.equal(f.sectionMeasure["sec-1"].key, "budget");
  assert.equal(DV.filters.describe(f, sheet.tables).length, 1);
  assert.equal(DV.filters.view(scope, f).rows.length, scope.rows.length, "switching the shown column hides no rows");
  f = DV.filters.setSectionMeasure(f, "sec-1", null);
  assert.equal(Object.keys(f.sectionMeasure).length, 0);
});
