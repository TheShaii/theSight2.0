"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { loadDV, analyzeSample, ROOT } = require("./helpers");

// export.js lives with the UI modules but its serializer is pure; load it on top.
const ctx = loadDV();
vm.runInContext("DV.dom = { h(){}, icon(){}, modal(){}, download(){}, toast(){} };", ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "js", "export.js"), "utf8"), ctx);
const DV = ctx.DV;
const sheets = analyzeSample(ctx, "sample_multiple_pivot_tables_dashboard.xlsx");

function fakeState() {
  const t = sheets[0].tables;
  const page = DV.page.autoSections(t, DV.recommender.recommend(t[0]).concat(DV.recommender.recommend(t[3])));
  return {
    sheets, fileName: "book.xlsx", workbook: { secret: "raw" }, layoutId: "executive", variantId: "glass-dark", paletteId: "default",
    density: "comfortable", corners: "rounded", filters: DV.filters.empty(), ui: {},
    customizations: { page, charts: {}, kpis: { hidden: [], order: [] } },
  };
}

test("serializer keeps only dashboard tables and drops the raw grid/workbook", () => {
  const p = DV.exporter.serialize(fakeState(), { title: "My board" });
  const json = JSON.stringify(p);
  assert.equal(p.sheets.length, 1);
  assert.equal(p.sheets[0].tables.length, 2, "only tables that have board items");
  assert.equal(p.sheets[0].grid, null);
  assert.ok(!json.includes("secret"), "no raw workbook");
  assert.ok(!json.includes("Fiscal Year") || p.sheets[0].params.length, "params are context only");
  assert.ok(!json.includes("Past Campaign"), "tables not on the dashboard are left out");
  assert.equal(p.view.variantId, "glass-dark");
  assert.deepEqual({ ...p.viewer }, { previewOnly: true, allowEdit: false, allowDesign: false, allowOpen: false }, "exports are filter-only previews");
});

test("round trip reproduces tables and totals", () => {
  const p = JSON.parse(DV.exporter.embedJSON(DV.exporter.serialize(fakeState(), {})));
  const t = p.sheets[0].tables[0];
  assert.equal(t.rows.length, 14);
  assert.ok(DV.utils.approxEqual(t.totals.grand["Actual Cost"], 5964312.48));
  assert.ok(p.sheets[0].reconcile.shared.length >= 1, "reconcile recomputed for the exported subset");
});

test("embedded JSON stays inert even with </script> in cell text", () => {
  const st = fakeState();
  st.sheets = JSON.parse(JSON.stringify(st.sheets));
  st.sheets[0].tables[0].rows[0].label = "</script><script>alert(1)</script>";
  const base = '<!DOCTYPE html><html><body><div id="app"></div></body></html>';
  const html = DV.exporter.buildHTML(base, DV.exporter.serialize(st, {}));
  const embed = html.slice(html.indexOf('<script id="dv-embed"'));
  const inner = embed.slice(embed.indexOf(">") + 1, embed.indexOf("</script>"));
  assert.ok(!inner.includes("<"), "no raw '<' inside the JSON block");
  assert.equal(JSON.parse(inner).sheets[0].tables[0].rows[0].label, "</script><script>alert(1)</script>");
  const again = DV.exporter.buildHTML(html, DV.exporter.serialize(st, {}));
  assert.equal(again.split('id="dv-embed"').length, 2, "re-export replaces, never stacks, the embed");
});
