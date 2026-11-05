/* Flat mode: a raw table (one header row, many transaction rows, no totals) can't be charted
   row-by-row, because members repeat. Summing raw rows IS valid, so we build summary tables:
   one per text dimension with few distinct values, plus one per month for date columns.
   They behave like any detected pivot; their totals are labelled as computed. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;
  const MAX_MEMBERS = 60;

  function summarize(base, groups, dimLabel, sheetName, idSuffix, ordered) {
    const measures = base.columns.filter((c) => c.role === "measure");
    const keys = [...groups.keys()];
    if (!ordered) keys.sort((a, b) => U.sum(groups.get(b).map((r) => r.values[measures[measures.length - 1].key])) - U.sum(groups.get(a).map((r) => r.values[measures[measures.length - 1].key])));
    const rows = keys.map((k, i) => {
      const rs = groups.get(k);
      const values = Object.fromEntries(measures.map((m) => [m.key, U.sum(rs.map((r) => r.values[m.key]))]));
      return { labels: { [dimLabel]: k }, values, kind: "body", excelRow: null, indent: 0, display: {}, dates: {}, index: i, label: k, count: rs.length };
    });
    const grand = Object.fromEntries(measures.map((m) => [m.key, U.sum(rows.map((r) => r.values[m.key]))]));
    const dimCol = { key: dimLabel, label: dimLabel, c: -1, role: "dimension", type: "text", numberFormat: null };
    const cols = [dimCol, ...measures.map((m) => ({ ...m }))];
    const title = `${measures[measures.length - 1].label} by ${dimLabel}`;
    return {
      id: `${sheetName}!flat:${idSuffix}`, blockId: "flat:" + idSuffix, sheet: sheetName, range: base.range,
      title, autoTitle: title, notes: [], dimensionLabels: [dimLabel],
      allColumns: cols.map((c) => ({ c: c.c, label: c.label, role: c.role })), columns: cols, rows,
      totals: { grand, grandRow: null, grandLabel: "Total (computed)", subtotals: [] },
      meta: { hasGrandTotal: true, structure: "aggregate", confidence: 1, issues: [], headerRows: [], totalRows: [], bbox: base.meta.bbox, banner: null, virtual: true, source: base.id, rowsSummed: base.rows.length },
    };
  }

  function summaries(base, sheetName) {
    const out = [];
    const dims = base.columns.filter((c) => c.role === "dimension");
    if (!base.columns.some((c) => c.role === "measure")) return out;
    for (const d of dims) {
      const isDate = base.rows.filter((r) => r.dates && r.dates[d.key]).length > base.rows.length * 0.8;
      const groups = new Map();
      for (const r of base.rows) {
        const k = isDate ? (r.dates[d.key] || "").slice(0, 7) : (r.labels[d.key] || "(blank)");
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }
      if (groups.size < 2 || groups.size > MAX_MEMBERS) continue;
      if (isDate) {
        const sorted = new Map([...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
        out.push(summarize(base, sorted, "Month", sheetName, "month:" + d.key, true));
      } else out.push(summarize(base, groups, d.label, sheetName, "dim:" + d.key, false));
    }
    return out;
  }

  DV.flat = { summaries };
})();
