/* Stage 5: build the normalized Table model from a classified block. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const G = DV.grid, U = DV.utils;

  function uniqueKeys(labels) {
    const seen = {};
    return labels.map((l) => {
      seen[l] = (seen[l] || 0) + 1;
      return seen[l] > 1 ? `${l} (${seen[l]})` : l;
    });
  }

  function numericValue(cell, zeroDash) {
    if (!G.hasValue(cell)) return null;
    if (cell.kind === "num") return cell.num;
    if (cell.kind === "dash" && zeroDash && /^[-–—]$/.test(cell.text)) return 0;
    return null;
  }

  function buildTable(sheetName, grid, block, cls, ov) {
    ov = ov || {};
    const cols = cls.columns.filter((c) => c.role !== "ignore");
    const keys = uniqueKeys(cols.map((c) => c.label));
    const columns = cols.map((c, i) => {
      const fmt = U.formatSections(c.prof.z);
      return {
        key: keys[i], label: c.label, c: c.c, role: c.role,
        type: c.role === "measure" || c.role === "total" ? "number" : "text",
        numberFormat: c.prof.z || null, zeroDash: fmt.zeroDash, additive: c.additive,
      };
    });
    const dims = columns.filter((c) => c.role === "dimension");
    // Total columns (row sums in cross-tabs) keep their values for the data table and shares.
    const measures = columns.filter((c) => c.role === "measure" || c.role === "total");

    // Tabular pivots print a parent label once; fill it down (never across total rows).
    const fill = {};
    const readRow = (r, kind) => {
      const labels = {}, values = {}, display = {}, dates = {};
      for (const d of dims) {
        const cell = G.cellAt(grid, r, d.c);
        let t = G.hasValue(cell) ? (cell.kind === "num" && cell.w ? cell.w : cell.text) : "";
        if (!t && kind === "body" && dims.length > 1 && d !== dims[dims.length - 1]) t = fill[d.key] || "";
        if (kind === "body") fill[d.key] = t;
        if (cell && cell.kind === "date" && cell.date instanceof Date && !isNaN(cell.date)) dates[d.key] = cell.date.toISOString().slice(0, 10);
        labels[d.key] = t;
      }
      for (const m of measures) {
        const cell = G.cellAt(grid, r, m.c);
        values[m.key] = numericValue(cell, m.zeroDash);
        if (cell && cell.kind === "num" && cell.fromText) display[m.key] = cell.text;
      }
      const indent = dims.length ? ((G.cellAt(grid, r, dims[0].c) || {}).indent || 0) : 0;
      const parent = dims.length > 1 ? labels[dims[0].key] : null;
      return { labels, values, kind, excelRow: r + 1, indent, display, dates, parent, level: parent ? 1 : 0 };
    };

    const rows = cls.bodyRows.map((r) => readRow(r, "body"));
    rows.forEach((row, i) => {
      row.index = i;
      row.label = dims.length ? dims.map((d) => row.labels[d.key]).filter(Boolean).join(" › ") || "(blank)" : `Row ${row.excelRow}`;
    });
    const totals = { grand: null, grandRow: null, grandLabel: null, subtotals: [] };
    for (const t of cls.totalRows) {
      const row = readRow(t.r, "total");
      if (t.kind === "grand") { totals.grand = row.values; totals.grandRow = t.r + 1; totals.grandLabel = t.label; }
      else totals.subtotals.push({ label: t.label, values: row.values, excelRow: t.r + 1 });
    }

    const range = U.rangeStr(cls.range.r0, cls.range.c0, cls.range.r1, cls.range.c1);
    const acronyms = columns.flatMap((c) => c.label.split(/\W+/)).filter((w) => w.length >= 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
    const auto = cls.bannerText ? U.titleCase(cls.bannerText, acronyms)
      : measures.length && dims.length ? `${measures[0].label} by ${dims[0].label}` : `Table ${range}`;
    return {
      id: `${sheetName}!${block.id}`,
      blockId: block.id,
      sheet: sheetName,
      range,
      title: ov.title || auto,
      autoTitle: auto,
      notes: cls.notes,
      dimensionLabels: dims.map((d) => d.label),
      allColumns: cls.columns.map((c) => ({ c: c.c, label: c.label, role: c.role })),
      columns,
      rows,
      totals,
      meta: {
        hasGrandTotal: !!totals.grand,
        structure: columns.some((c) => c.role === "total") || (measures.filter((m) => m.role === "measure").length >= 3 && measures.filter((m) => m.role === "measure").every((m) => /^((19|20)[0-9]{2}|q[1-4]|fy ?[0-9]{2,4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)$/i.test(m.label))) ? "crosstab" : dims.length > 1 ? "hierarchy" : "list",
        confidence: cls.confidence,
        issues: cls.issues,
        headerRows: cls.headerRows.map((r) => r + 1),
        totalRows: cls.totalRows.map((t) => ({ row: t.r + 1, kind: t.kind, label: t.label, bySum: t.bySum, mismatch: t.mismatch })),
        bbox: { r0: block.r0, c0: block.c0, r1: block.r1, c1: block.c1 },
        banner: block.banner,
      },
    };
  }

  DV.tables = { buildTable };
})();
