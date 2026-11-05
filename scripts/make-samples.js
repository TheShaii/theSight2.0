"use strict";
// Generates samples/*.xlsx deterministically. The reference file replicates the layout
// described in CLAUDE.md §5.1 with invented demo data (the documented totals hold).
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const OUT = path.join(__dirname, "..", "samples");
const FMT = "#,##0.00;[Red]\\(#,##0.00\\);\\-";

// Split `total` across `weights` so that rounded parts sum exactly to total (largest remainder).
function distribute(total, weights, decimals = 2) {
  const unit = Math.pow(10, decimals);
  const units = Math.round(total * unit);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (units * w) / wsum);
  const parts = raw.map(Math.floor);
  let rest = units - parts.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (rest > 0) { parts[i]++; rest--; } });
  return parts.map((p) => p / unit);
}

// Plain float addition, like Excel's cached SUM (keeps realistic float noise).
const floatSum = (arr) => arr.reduce((a, b) => a + b, 0);

function makeSheetWriter() {
  const ws = {};
  const merges = [];
  return {
    ws,
    text(addr, v) { ws[addr] = { t: "s", v }; },
    num(addr, v, z = FMT) { ws[addr] = { t: "n", v, z }; },
    sum(addr, v, range, z = FMT) { ws[addr] = { t: "n", v, f: `SUM(${range})`, z }; },
    merge(range) { merges.push(XLSX.utils.decode_range(range)); },
    finish(ref, cols) {
      ws["!ref"] = ref;
      ws["!merges"] = merges;
      if (cols) ws["!cols"] = cols;
      return ws;
    },
  };
}

// Writes a list-style table: header row at `row`, body below, Grand Total after the body.
function writeTable(w, { col, row, dimLabel, measures, members, values, variance }) {
  const c = (i) => XLSX.utils.encode_col(XLSX.utils.decode_col(col) + i);
  w.text(`${col}${row}`, dimLabel);
  measures.forEach((m, j) => w.text(`${c(j + 1)}${row}`, m));
  members.forEach((name, i) => {
    const r = row + 1 + i;
    w.text(`${col}${r}`, name);
    measures.forEach((m, j) => w.num(`${c(j + 1)}${r}`, values[m][i]));
  });
  const totalRow = row + 1 + members.length;
  w.text(`${col}${totalRow}`, "Grand Total");
  measures.forEach((m, j) => {
    const L = c(j + 1);
    w.sum(`${L}${totalRow}`, floatSum(values[m]), `${L}${row + 1}:${L}${totalRow - 1}`);
  });
  return totalRow;
}

function withVariance(values, actualKey = "Actual Cost", budgetKey = "Budget") {
  values["Budget vs Actual"] = values[actualKey].map((e, i) => e - values[budgetKey][i]);
  return values;
}

// Invented demo data (a marketing budget): no real organisation, people or figures.
function referenceWorkbook() {
  const BUDGET = 4820500;
  const ACTUAL = 5964312.48;
  const PAID = 2175640.19;
  const w = makeSheetWriter();

  w.text("A1", "MARKETING BUDGET & SPEND — DEMO DASHBOARD");
  w.merge("A1:L1");
  w.text("A2", "Invented demo data for illustration only. All amounts in USD.");
  w.merge("A2:L2");
  w.text("A4", "Fiscal Year");
  w.num("B4", 2026, "General");

  // Table 1: by campaign (14 rows)
  const campaigns = [
    "Spring Launch", "Summer Sale", "Back to School", "Holiday Push", "Brand Refresh", "Loyalty Program",
    "Product Webinars", "Trade Shows", "Influencer Series", "Search Ads", "Social Video", "Email Nurture",
    "Customer Stories", "Local Sponsorships",
  ];
  const sBudgetW = [9.5, 8.2, 7.6, 6.1, 5.4, 4.8, 3.9, 3.3, 2.7, 2.4, 2.1, 1.6, 1.2, 0.8];
  const sActualFactor = [1.45, 1.22, 1.35, 1.11, 0.92, 1.28, 1.05, 1.32, 0.85, 1.2, 1.1, 1.6, 0.78, 1.15];
  const sBudget = distribute(BUDGET, sBudgetW, 0);
  const sActual = distribute(ACTUAL, sBudget.map((b, i) => b * sActualFactor[i]));
  const sPaid = distribute(PAID, sActual.map((e, i) => e * (0.3 + (i % 4) * 0.04)));
  // Excel-style float noise without changing the total: 98765.43 → 98765.429999999993
  sPaid[6] = Math.round((sPaid[6] + sPaid[5] - 98765.43) * 100) / 100;
  sPaid[5] = 98765.429999999993;
  const t1 = withVariance({
    Budget: sBudget,
    Committed: sActual.map((e, i) => Math.round(e * (0.22 + (i % 3) * 0.05) * 100) / 100),
    Invoiced: sActual.map((e, i) => Math.round(e * (0.48 + (i % 5) * 0.04) * 100) / 100),
    "Actual Cost": sActual,
    Paid: sPaid,
  });
  w.text("A6", "BUDGET AND SPEND BY CAMPAIGN");
  w.merge("A6:G6");
  writeTable(w, {
    col: "A", row: 7, dimLabel: "Campaign",
    measures: ["Budget", "Committed", "Invoiced", "Actual Cost", "Paid", "Budget vs Actual"],
    members: campaigns, values: t1,
  });

  // Table 2: by department (6 rows) — same Budget / Actual / Paid totals
  const departments = ["Brand", "Digital", "Events", "Partnerships", "Content", "Research"];
  const dBudget = distribute(BUDGET, [24, 19, 14, 9, 7, 4], 0);
  const dActual = distribute(ACTUAL, dBudget.map((b, i) => b * [1.4, 1.25, 1.15, 0.95, 1.5, 1.1][i]));
  const t2 = withVariance({
    Budget: dBudget,
    "Actual Cost": dActual,
    Paid: distribute(PAID, dActual.map((e, i) => e * [0.35, 0.3, 0.28, 0.4, 0.25, 0.32][i])),
  });
  w.text("I6", "BUDGET AND SPEND BY DEPARTMENT");
  w.merge("I6:M6");
  writeTable(w, {
    col: "I", row: 7, dimLabel: "Department",
    measures: ["Budget", "Actual Cost", "Paid", "Budget vs Actual"],
    members: departments, values: t2,
  });

  // Table 3: past seasons by phase (3 rows) — same Budget total, different spend
  const pBudget = distribute(BUDGET, [38, 33, 29], 0);
  const pActual = distribute(4310955.7, [41, 31, 28]);
  w.text("A26", "PAST CAMPAIGN SEASONS — SPEND BY PHASE");
  writeTable(w, {
    col: "A", row: 27, dimLabel: "Phase", measures: ["Budget", "Committed", "Invoiced", "Actual Cost", "Paid"],
    members: ["Phase 1", "Phase 2", "Phase 3"],
    values: {
      Budget: pBudget,
      Committed: pActual.map((e) => Math.round(e * 0.27 * 100) / 100),
      Invoiced: pActual.map((e) => Math.round(e * 0.55 * 100) / 100),
      "Actual Cost": pActual,
      Paid: distribute(1602418.35, [36, 34, 30]),
    },
  });

  // Table 4: agencies (10 rows) — same Actual Cost total, long-tailed (Pareto-friendly)
  const agencies = ["Brightline Media", "Copperleaf Creative", "Northstar Digital", "Bluewave Events",
    "Harborview PR", "Summit Print Co.", "Lumen Analytics", "Oakridge Studios", "Pixel & Pine", "Riverside Promotions"];
  const aActual = distribute(ACTUAL, [31, 19, 13, 9, 7, 6, 5, 4, 3.5, 2.5]);
  w.text("I26", "AGENCY SPEND — TOP DEMO AGENCIES");
  writeTable(w, {
    col: "I", row: 27, dimLabel: "Agency", measures: ["Committed", "Invoiced", "Actual Cost"], members: agencies,
    values: {
      Committed: aActual.map((e, i) => Math.round(e * (0.2 + (i % 3) * 0.06) * 100) / 100),
      Invoiced: aActual.map((e, i) => Math.round(e * (0.5 + (i % 4) * 0.05) * 100) / 100),
      "Actual Cost": aActual,
    },
  });

  const cols = [{ wch: 28 }, ...Array(6).fill({ wch: 15 }), { wch: 3 }, { wch: 28 }, ...Array(4).fill({ wch: 15 })];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, w.finish("A1:M38", cols), "Budget Dashboard");
  return wb;
}

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, "sample_multiple_pivot_tables_dashboard.xlsx");
XLSX.writeFile(referenceWorkbook(), file);
console.log("wrote", path.relative(process.cwd(), file));

// ---- Other pivot shapes (M2) ----
const aoaSheet = (aoa, merges, fmtCols) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (merges) ws["!merges"] = merges.map((m) => XLSX.utils.decode_range(m));
  // Money format on numeric cells (row/col filter optional)
  for (const addr of Object.keys(ws)) {
    if (addr[0] === "!") continue;
    const c = ws[addr];
    if (c.t === "n" && (!fmtCols || fmtCols(XLSX.utils.decode_cell(addr)))) c.z = FMT;
  }
  return ws;
};
const sumCol = (rows, i) => rows.reduce((a, r) => a + r[i], 0);

// Cross-tab: Channel down the side × Year across, Grand Total row and column.
function crosstabWorkbook() {
  const years = [2022, 2023, 2024, 2025];
  const channels = [["Search", 0.41, 0.44, 0.52, 0.6], ["Social", 0.63, 0.61, 0.74, 0.88], ["Events", 0.22, 0.25, 0.24, 0.29],
    ["Email", 0.14, 0.16, 0.19, 0.21], ["Print", 0.11, 0.1, 0.13, 0.15], ["Radio", 0.08, 0.09, 0.09, 0.12]]
    .map(([n, ...v]) => [n, ...v.map((x) => Math.round(x * 1e6))]);
  const body = channels.map((r) => [...r, r.slice(1).reduce((a, b) => a + b, 0)]);
  const total = ["Grand Total", ...years.map((_, i) => sumCol(body, i + 1)), sumCol(body, years.length + 1)];
  const aoa = [["SPEND BY CHANNEL AND YEAR"], [], ["Channel", ...years, "Grand Total"], ...body, total];
  const ws = aoaSheet(aoa, ["A1:F1"], (c) => c.r >= 3);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Crosstab");
  return wb;
}

// Excel PivotTable output in compact form: filter area, "Sum of …", Column Labels, Row Labels,
// a (blank) member and a Grand Total row and column.
function compactPivotWorkbook() {
  const qs = ["Q1", "Q2", "Q3", "Q4"];
  const cats = [["Hardware", 120, 135, 150, 160], ["Software", 210, 220, 205, 240], ["Services", 90, 95, 110, 120], ["Training", 30, 28, 35, 41], ["(blank)", 5, 0, 7, 2]];
  const body = cats.map((r) => [...r, r.slice(1).reduce((a, b) => a + b, 0)]);
  const total = ["Grand Total", ...qs.map((_, i) => sumCol(body, i + 1)), sumCol(body, qs.length + 1)];
  const aoa = [["Region", "(All)"], [], ["Sum of Amount", "Column Labels"], ["Row Labels", ...qs, "Grand Total"], ...body, total];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "PivotTable");
  return wb;
}

// Tabular-form hierarchy: Region printed once, blanks beneath, "<Region> Total" subtotals.
function hierarchicalWorkbook() {
  const data = { East: [["Hardware", 300, 210], ["Software", 520, 300], ["Services", 180, 140]],
    West: [["Hardware", 260, 190], ["Software", 610, 350], ["Services", 150, 120]],
    North: [["Hardware", 140, 100], ["Software", 330, 210], ["Services", 90, 75]] };
  const aoa = [["SALES BY REGION AND CATEGORY"], [], ["Region", "Category", "Sales", "Cost"]];
  let gs = 0, gc = 0;
  for (const [reg, rows] of Object.entries(data)) {
    rows.forEach((r, i) => aoa.push([i === 0 ? reg : null, ...r]));
    const s = rows.reduce((a, r) => a + r[1], 0), c = rows.reduce((a, r) => a + r[2], 0);
    aoa.push([`${reg} Total`, null, s, c]);
    gs += s; gc += c;
  }
  aoa.push(["Grand Total", null, gs, gc]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaSheet(aoa, ["A1:D1"]), "Hierarchy");
  return wb;
}

// Same report on two sheets (periods): selector + compare.
function multiSheetWorkbook() {
  const wb = XLSX.utils.book_new();
  const make = (year, k) => {
    const rows = [["Operations", 410, 455], ["Maintenance", 320, 360], ["Engineering", 210, 190], ["Projects", 150, 175]].map(([n, b, e]) => [n, Math.round(b * k) * 1000, Math.round(e * k) * 1000]);
    const aoa = [[`COST CENTER REPORT ${year}`], [], ["Cost Center", "Budget", "Actual"], ...rows, ["Grand Total", sumCol(rows, 1), sumCol(rows, 2)]];
    XLSX.utils.book_append_sheet(wb, aoaSheet(aoa, ["A1:C1"]), String(year));
  };
  make(2025, 1);
  make(2026, 1.12);
  return wb;
}

// Flat data: one header row, hundreds of transaction rows, no totals.
function flatWorkbook() {
  const regions = ["North", "South", "East", "West"], products = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
  const aoa = [["Date", "Region", "Product", "Units", "Revenue"]];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 600; i++) {
    const d = new Date(Date.UTC(2025, Math.floor(i / 50), 1 + (i % 28)));
    const units = 1 + Math.floor(rnd() * 40);
    aoa.push([d, regions[Math.floor(rnd() * 4)], products[Math.floor(rnd() * 5)], units, Math.round(units * (40 + rnd() * 60) * 100) / 100]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  for (let r = 1; r <= 600; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 0 })]; if (c) c.z = "yyyy-mm-dd"; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales");
  return wb;
}

// Dirty data: padded text, numbers stored as text, a dash, a merged title.
function messyWorkbook() {
  const aoa = [["  Messy Report  "], [], [" Item ", " Amount ", "Share"], ["  Widgets", "1,234", "12%"], ["Gadgets ", "$50", "5%"],
    ["Gizmos", "(500)", "-"], ["Doohickeys", 2000, "83%"], ["Grand Total", 2784, "100%"]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaSheet(aoa, ["A1:C1"]), "Messy");
  return wb;
}

for (const [name, fn] of [["crosstab_pivot", crosstabWorkbook], ["compact_pivot", compactPivotWorkbook], ["hierarchical_pivot", hierarchicalWorkbook],
  ["multi_sheet", multiSheetWorkbook], ["flat_sales", flatWorkbook], ["messy", messyWorkbook]]) {
  const f = path.join(OUT, name + ".xlsx");
  XLSX.writeFile(fn(), f, { cellDates: true });
  console.log("wrote", path.relative(process.cwd(), f));
}
