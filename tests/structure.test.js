"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadDV, analyzeSample, ROOT } = require("./helpers");

const ctx = loadDV();
const DV = ctx.DV;
const REF = "sample_multiple_pivot_tables_dashboard";
const expected = JSON.parse(fs.readFileSync(path.join(ROOT, "samples", REF + ".expected.json"), "utf8"));
const sheets = analyzeSample(ctx, REF + ".xlsx");
const sheet = sheets.find((s) => s.name === expected.sheet);
const approx = (a, b) => DV.utils.approxEqual(a, b);

test("reference: one sheet in summary mode", () => {
  assert.ok(sheet, "sheet found");
  assert.equal(sheet.mode, expected.mode);
});

test("reference: exactly the expected tables", () => {
  assert.equal(sheet.tables.length, expected.tables.length, sheet.tables.map((t) => t.range).join(", "));
  expected.tables.forEach((exp, i) => {
    const t = sheet.tables[i];
    assert.equal(t.range, exp.range, `table ${i} range`);
    assert.equal(t.title, exp.title, `table ${i} title`);
    assert.deepEqual([...t.dimensionLabels], exp.dimensions, `table ${i} dimensions`);
    assert.deepEqual([...t.columns.filter((c) => c.role === "measure").map((c) => c.label)], exp.measures, `table ${i} measures`);
    assert.equal(t.rows.length, exp.bodyRows, `table ${i} body rows`);
    assert.equal(t.totals.grandRow, exp.totalRow, `table ${i} total row`);
    assert.ok(t.meta.confidence >= 0.7, `table ${i} confidence ${t.meta.confidence}`);
  });
});

test("reference: title, subtitle and parameter are context, not tables", () => {
  assert.equal(sheet.title, expected.title);
  assert.ok(sheet.subtitle.startsWith(expected.subtitleStartsWith), sheet.subtitle);
  assert.equal(sheet.params.length, expected.params.length);
  expected.params.forEach((p, i) => {
    assert.equal(sheet.params[i].label, p.label);
    assert.equal(sheet.params[i].value, p.value);
  });
  for (const t of sheet.tables) {
    for (const r of t.rows) {
      assert.ok(!/fiscal year|demo dashboard/i.test(r.label), `context leaked into ${t.title}: ${r.label}`);
    }
  }
});

test("reference: Grand Total rows never appear as data rows", () => {
  for (const t of sheet.tables) {
    assert.ok(t.totals.grand, `${t.title} has grand total`);
    for (const r of t.rows) assert.ok(!DV.classify.TOTAL_LABEL.test(r.label), `${t.title}: ${r.label}`);
  }
});

test("reference: derived variance columns", () => {
  for (const d of expected.derived) {
    const t = sheet.tables[d.table];
    const col = t.columns.find((c) => c.label === d.column);
    assert.ok(col && col.derived, `${d.column} derived in ${t.title}`);
    assert.equal(col.derived.op, d.op);
    assert.equal(col.derived.a, d.a);
    assert.equal(col.derived.b, d.b);
    assert.equal(col.derived.positiveLabel, d.positiveLabel);
    assert.equal(col.derived.positiveIsGood, false);
  }
  // Plain measures must not be mistaken for derived ones.
  const budget = sheet.tables[0].columns.find((c) => c.label === "Budget");
  assert.equal(budget.derived, null);
});

test("reference: every table reconciles internally", () => {
  assert.equal(sheet.reconcile.mismatches.length, 0, JSON.stringify(sheet.reconcile.mismatches));
  for (const x of sheet.reconcile.internal) assert.ok(x.checks.length > 0, `${x.title} checked`);
});

test("reference: shared totals across tables", () => {
  for (const s of expected.shared) {
    const cl = sheet.reconcile.shared.find((c) => c.label === s.measure && approx(c.value, s.value));
    assert.ok(cl, `shared cluster for ${s.measure}`);
    assert.deepEqual([...cl.tables].sort(), s.tables);
  }
  assert.equal(sheet.reconcile.reconciledTables, 4);
});

test("number formatting honors Excel formats and float noise", () => {
  for (const f of expected.formatting) {
    const out = DV.utils.formatNumber(f.value, f.z);
    assert.equal(out.text, f.text);
    if (f.red) assert.equal(out.red, true);
  }
  for (const c of expected.compact) assert.equal(DV.utils.formatCompact(c.value), c.text);
});

test("loose number parsing", () => {
  const p = DV.utils.parseLooseNumber;
  assert.equal(p("1,234"), 1234);
  assert.equal(p("$50"), 50);
  assert.equal(p("12%"), 0.12);
  assert.equal(p("(500)"), -500);
  assert.equal(p("-"), null);
  assert.equal(p("U1"), null);
  assert.equal(p("Dept-100 Brand"), null);
});

test("sum-based total detection needs ≥2 body rows and skips non-additive columns", () => {
  const X = ctx.XLSX;
  const mk = (aoa) => DV.analyze.analyzeSheet("T", X.utils.aoa_to_sheet(aoa));
  // One body row: the row trivially "equals" its total; must not be eaten as a total.
  const one = mk([["Item", "Amount"], ["Alpha", 10], ["", 10]]);
  assert.equal(one.tables[0].rows.length, 2);
  // A percent column that happens to sum is not evidence of a total row.
  const pct = mk([["Item", "Share %"], ["A", 0.25], ["B", 0.25], ["C", 0.5]]);
  assert.equal(pct.tables[0].rows.length, 3);
  assert.equal(pct.tables[0].totals.grand, null);
  // Unlabelled sum row is a total.
  const unl = mk([["Item", "Amount", "Cost"], ["A", 1, 4], ["B", 2, 5], ["", 3, 9]]);
  assert.equal(unl.tables[0].rows.length, 2);
  assert.ok(unl.tables[0].totals.grand);
});

test("review overrides: rename, not-a-table, change total row", () => {
  const buf = fs.readFileSync(path.join(ROOT, "samples", REF + ".xlsx"));
  const wb = DV.grid.readWorkbook(new ctx.Uint8Array(buf));
  const ws = wb.Sheets[expected.sheet];
  const ids = sheet.tables.map((t) => t.blockId);
  const ov = { blocks: { [ids[0]]: { title: "Campaigns" }, [ids[3]]: { notTable: true }, [ids[2]]: { totalRows: [] } } };
  const s2 = DV.analyze.analyzeSheet(expected.sheet, ws, ov);
  assert.equal(s2.tables.length, 3);
  assert.equal(s2.tables[0].title, "Campaigns");
  const phases = s2.tables.find((t) => t.blockId === ids[2]);
  assert.equal(phases.rows.length, 4, "Grand Total becomes a body row when user clears totals");
});
