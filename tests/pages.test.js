"use strict";
// Dashboard pages and page-wide (field-scoped) filters.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadDV, analyzeSample } = require("./helpers");

const ctx = loadDV();
const DV = ctx.DV, X = ctx.XLSX, F = DV.filters;
const one = (name, aoa) => DV.analyze.analyzeSheet(name, X.utils.aoa_to_sheet(aoa)).tables[0];
const labels = (v) => [...v.rows.map((r) => r.label)].sort();

const scopeBudget = one("A", [["Scope", "Budget"], ["Search", 10], ["Social", 20], ["Email", 30], ["Grand Total", 60]]);
const scopeCost = one("B", [["Scope", "Cost"], ["Search", 12], ["Social", 18], ["Print", 5], ["Grand Total", 35]]);
const vendors = one("C", [["Vendor", "Spend"], ["Acme", 7], ["Globex", 9], ["Grand Total", 16]]);

test("a filter on a field filters every table with that field; others are left alone and say so", () => {
  const f = F.setMembers(F.empty(), F.dimKey(scopeBudget), ["Search", "Social"]);
  assert.deepEqual(labels(F.view(scopeBudget, f)), ["Search", "Social"]);
  assert.deepEqual(labels(F.view(scopeCost, f)), ["Search", "Social"], "another table with Scope is filtered too");
  const v = F.view(vendors, f);
  assert.equal(v.rows.length, 2, "Vendor table untouched");
  assert.deepEqual([...v.unaffected], ["dim:scope"]);
  assert.equal(F.scopeLabel("dim:scope", [vendors, scopeCost]), "Scope");
});

test("value ranges and Top N are page-wide by field too", () => {
  let f = F.setValueRange(F.empty(), F.measureKeyOf("Budget"), { min: 15, max: null });
  assert.deepEqual(labels(F.view(scopeBudget, f)), ["Email", "Social"]);
  assert.equal(F.view(scopeCost, f).rows.length, 3, "no Budget column → untouched");
  f = F.setTopN(F.empty(), F.dimKey(scopeCost), { dir: "top", n: 1 });
  assert.equal(F.view(scopeBudget, f).rows.length, 1);
  assert.equal(F.view(vendors, f).rows.length, 2);
  assert.equal(F.clearTable(f, scopeBudget).topN["dim:scope"], undefined, "clearing a table clears the field filters that reach it");
});

test("hierarchy: filtering Region = East keeps East's children", () => {
  const t = analyzeSample(ctx, "hierarchical_pivot.xlsx")[0].tables[0];
  const f = F.setMembers(F.empty(), "dim:region", ["East"]);
  const v = F.view(t, f);
  assert.equal(v.rows.length, 3);
  assert.ok(v.rows.every((r) => r.label.startsWith("East ›")));
  assert.deepEqual([...F.memberOrder(t)], ["East", "West", "North"]);
});

test("pages: old single-page dashboards migrate; multi-sheet builds one page per sheet", () => {
  const sec = DV.page.newSection("S");
  const cz = DV.page.migrate({ page: [sec] }, []);
  assert.equal(cz.pages.length, 1);
  assert.equal(cz.pages[0].title, "Overview");
  assert.equal(cz.activePage, cz.pages[0].id);
  assert.equal(DV.page.list(cz)[0], cz.pages[0].sections[0]);
  const sheets = analyzeSample(ctx, "multi_sheet.xlsx");
  const picked = sheets.flatMap((s) => s.tables).flatMap((t) => DV.recommender.recommend(t));
  const pages = DV.page.autoPages(sheets, picked);
  assert.deepEqual([...pages.map((p) => p.title)], ["2025", "2026"]);
  const ids = pages.flatMap((p) => p.sections).flatMap((s) => s.items).map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "item ids are unique across pages");
});
