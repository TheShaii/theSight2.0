/* Stage 1: SheetJS workbook → normalized 2D grid per sheet (values, formats, merges). */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;
  const MAX_CELLS = 2000000;

  function readWorkbook(data) {
    if (!globalThis.XLSX) throw new Error("Spreadsheet library failed to load.");
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    return XLSX.read(bytes, { type: "array", cellDates: true, cellNF: true, cellStyles: true });
  }

  // kind: "num" | "text" | "date" | "bool" | "dash" | "merged" | "empty"
  function normalizeCell(c) {
    if (!c || (c.v == null && c.f == null)) return null;
    const out = { v: c.v, w: c.w, t: c.t, z: c.z, f: c.f, s: c.s, num: null, text: "", kind: "empty" };
    if (c.t === "n") {
      out.kind = "num"; out.num = c.v; out.text = c.w != null ? String(c.w) : String(c.v);
    } else if (c.t === "d" || c.v instanceof Date) {
      out.kind = "date"; out.date = c.v; out.text = c.w || (c.v && c.v.toISOString ? c.v.toISOString().slice(0, 10) : "");
    } else if (c.t === "b") {
      out.kind = "bool"; out.text = c.v ? "TRUE" : "FALSE";
    } else if (c.t === "e") {
      out.kind = "dash"; out.text = c.w || "#ERR";
    } else {
      const text = U.normText(c.v == null ? "" : c.v);
      if (!text) return null;
      out.text = text;
      const n = U.parseLooseNumber(text);
      if (n != null) { out.kind = "num"; out.num = n; out.fromText = true; }
      else if (U.isDashText(text)) out.kind = "dash";
      else out.kind = "text";
    }
    if (c.f != null && c.v == null) out.missingCache = true;
    if (c.s && c.s.alignment && c.s.alignment.indent) out.indent = c.s.alignment.indent;
    const lead = /^(\s+)/.exec(c.t === "s" && typeof c.v === "string" ? c.v.replace(/ /g, " ") : "");
    if (lead && !out.indent) out.indent = Math.floor(lead[1].length / 2);
    return out;
  }

  function sheetToGrid(ws) {
    const warnings = [];
    if (!ws || !ws["!ref"]) return { rows: 0, cols: 0, cells: [], merges: [], warnings };
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const rows = range.e.r + 1, cols = range.e.c + 1;
    if (rows * cols > MAX_CELLS) {
      warnings.push(`Sheet is very large (${rows.toLocaleString()} × ${cols}); only the first rows are analyzed.`);
    }
    const maxRows = Math.min(rows, Math.floor(MAX_CELLS / Math.max(cols, 1)));
    const cells = new Array(maxRows);
    const dense = Array.isArray(ws["!data"]);
    let missingCache = 0;
    for (let r = 0; r < maxRows; r++) {
      const row = new Array(cols).fill(null);
      for (let c = range.s.c; c < cols; c++) {
        const raw = dense ? (ws["!data"][r] || [])[c] : ws[U.addr(r, c)];
        const cell = normalizeCell(raw);
        if (cell && cell.missingCache) missingCache++;
        row[c] = cell;
      }
      cells[r] = row;
    }
    if (missingCache) {
      warnings.push(`${missingCache} formula cell(s) have no saved value. Open the file in Excel, save it, and upload again.`);
    }

    // The value lives in the top-left cell; other merged cells point at it (never fill down titles).
    const merges = (ws["!merges"] || []).map((m, i) => ({ id: i, r0: m.s.r, c0: m.s.c, r1: m.e.r, c1: m.e.c }))
      .filter((m) => m.r0 < maxRows);
    for (const m of merges) {
      for (let r = m.r0; r <= Math.min(m.r1, maxRows - 1); r++) {
        for (let c = m.c0; c <= m.c1; c++) {
          if (r === m.r0 && c === m.c0) { if (cells[r][c]) cells[r][c].merge = m; continue; }
          if (!cells[m.r0][m.c0]) continue;
          cells[r][c] = { kind: "merged", mergedInto: m, text: "", num: null };
        }
      }
    }
    return { rows: maxRows, cols, cells, merges, warnings };
  }

  const cellAt = (grid, r, c) => (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols ? grid.cells[r][c] : null);
  const isOccupied = (cell) => !!cell && cell.kind !== "empty";
  const hasValue = (cell) => !!cell && cell.kind !== "empty" && cell.kind !== "merged";

  DV.grid = { readWorkbook, sheetToGrid, normalizeCell, cellAt, isOccupied, hasValue };
})();
