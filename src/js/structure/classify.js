/* Stage 3: classify a block's rows (banner / header / body / total) and columns (dimension / measure). */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const G = DV.grid, U = DV.utils;

  const TOTAL_LABEL = /^(grand\s+)?totals?$|^sub\s*-?\s*totals?$|\stotals?$|^overall(\s+total)?$|^sum$|^totals?\s*:|^total\s+(general|général)$|^gesamtergebnis$|^summe$|^totaal$|^総計$|^合计$/i;
  const SUBTOTAL_LABEL = /^sub\s*-?\s*totals?$|.+\stotals?$/i;
  const NON_ADDITIVE = /%|percent|pct|avg|average|mean|median|rate|ratio|share|margin|price|index/i;
  const TIME_HEADER = /^(year|fy|fiscal|month|quarter|qtr|period|date|week|day)\b/i;

  function rowStats(grid, r, c0, c1) {
    const s = { values: 0, text: 0, num: 0, first: -1, cells: [] };
    for (let c = c0; c <= c1; c++) {
      const cell = G.cellAt(grid, r, c);
      if (!G.hasValue(cell)) continue;
      s.values++;
      if (cell.kind === "num") s.num++;
      else if (cell.kind === "text" || cell.kind === "date") s.text++;
      if (s.first < 0) s.first = c;
      s.cells.push(c);
    }
    return s;
  }

  const isYear = (cell) => cell && cell.kind === "num" && Number.isInteger(cell.num) && cell.num >= 1900 && cell.num <= 2100;
  // Header-like cells: text, or year numbers (cross-tabs put years across the top).
  function headerish(grid, r, b) {
    const s = rowStats(grid, r, b.c0, b.c1);
    let years = 0;
    for (const c of s.cells) if (isYear(grid.cells[r][c])) years++;
    return { s, years, textLike: s.text + (years >= 2 ? years : 0) };
  }
  function findHeaderRow(grid, start, b) {
    for (let r = start; r <= Math.min(b.r1 - 1, start + 4); r++) {
      const { s, textLike } = headerish(grid, r, b);
      if (s.values < 2 || textLike / s.values < 0.5) continue;
      // Some row below must carry numbers under this header's columns.
      for (let rr = r + 1; rr <= Math.min(b.r1, r + 3); rr++) {
        const below = rowStats(grid, rr, b.c0, b.c1);
        if (below.num > 0) return r;
      }
    }
    return -1;
  }

  // Second header row: mostly text, no numbers, and the row above has merged/blank parents.
  function isSubHeader(grid, r, b, parentRow) {
    if (r > b.r1 - 1) return false;
    const s = rowStats(grid, r, b.c0, b.c1);
    const p = rowStats(grid, parentRow, b.c0, b.c1);
    const parentMerged = p.cells.some((c) => { const m = grid.cells[parentRow][c].merge; return m && m.c1 > m.c0; });
    return s.values >= 2 && s.num === 0 && (parentMerged || p.values < s.values);
  }

  function headerLabels(grid, headerRows, c0, c1) {
    const levels = headerRows.map((r) => {
      const out = [];
      let carry = "";
      for (let c = c0; c <= c1; c++) {
        const cell = G.cellAt(grid, r, c);
        if (cell && cell.kind === "merged") { out.push(cell.mergedInto.r0 === r ? carry : ""); continue; }
        const t = G.hasValue(cell) ? (cell.kind === "num" && cell.w ? cell.w : cell.text) : "";
        carry = t;
        // Only the top level fills right (group headers over several children).
        out.push(t || (headerRows.length > 1 && r === headerRows[0] ? carry : ""));
      }
      return out;
    });
    return levels;
  }

  function columnProfile(grid, c, rows) {
    const p = { text: 0, num: 0, dash: 0, empty: 0, values: [], z: null, intYears: 0 };
    for (const r of rows) {
      const cell = G.cellAt(grid, r, c);
      if (!G.hasValue(cell)) { p.empty++; continue; }
      if (cell.kind === "num") {
        p.num++; p.values.push(cell.num);
        if (!p.z && cell.z && cell.z !== "General") p.z = cell.z;
        if (Number.isInteger(cell.num) && cell.num >= 1900 && cell.num <= 2100) p.intYears++;
      } else if (cell.kind === "dash") p.dash++;
      else p.text++;
    }
    p.nonEmpty = p.text + p.num + p.dash;
    return p;
  }

  function classifyBlock(grid, block, ov) {
    ov = ov || {};
    const issues = [];
    let confidence = 1;
    const b = block;
    let start = b.r0;
    let bannerText = b.banner ? b.banner.text : null;
    const notes = [];
    if (b.banner) start = b.banner.r + 1;
    // Lines above the header holding a single text value are banners / notes.
    while (start < b.r1) {
      const s = rowStats(grid, start, b.c0, b.c1);
      const caption = s.cells.some((c) => /^column labels$/i.test(grid.cells[start][c].text || ""));
      if (caption && ov.headerRow !== start) {
        const t = s.cells.map((c) => grid.cells[start][c].text).find((x) => x && !/^column labels$/i.test(x));
        if (t) { if (bannerText == null) bannerText = t; else notes.push(t); }
        start++;
        continue;
      }
      if (s.values === 1 && s.text === 1 && ov.headerRow !== start) {
        const t = grid.cells[start][s.first].text;
        if (bannerText == null) bannerText = t; else notes.push(t);
        start++;
      } else if (s.values === 0) start++;
      else break;
    }

    let headerRow = ov.headerRow != null ? ov.headerRow : findHeaderRow(grid, start, b);
    let headerRows = [];
    if (headerRow < 0) {
      issues.push("No header row found; columns were named by letter.");
      confidence -= 0.35;
    } else {
      headerRows = [headerRow];
      if (ov.headerRow == null && isSubHeader(grid, headerRow + 1, b, headerRow)) headerRows.push(headerRow + 1);
    }
    const dataStart = headerRows.length ? headerRows[headerRows.length - 1] + 1 : start;

    // Columns: drop ones that are empty from the header down.
    const allRows = [];
    for (let r = dataStart; r <= b.r1; r++) allRows.push(r);
    const levels = headerRows.length ? headerLabels(grid, headerRows, b.c0, b.c1) : [];
    const columns = [];
    for (let c = b.c0; c <= b.c1; c++) {
      const prof = columnProfile(grid, c, allRows);
      const parts = levels.map((l) => l[c - b.c0]).filter(Boolean);
      const label = parts.length ? [...new Set(parts)].join(" · ") : "";
      if (!label && prof.nonEmpty === 0) continue;
      columns.push({ c, label: label || "Column " + U.colName(c), parts, prof });
    }

    // Candidate total rows by label, so they don't skew the dimension test.
    const labelOf = (r) => {
      for (const col of columns) {
        const cell = G.cellAt(grid, r, col.c);
        if (cell && (cell.kind === "text")) return cell.text;
      }
      return "";
    };

    // Dimension columns: contiguous from the left, mostly text (or time-like headers).
    let dimCount = 0;
    for (const col of columns) {
      const p = col.prof;
      const textish = p.nonEmpty > 0 && p.text / p.nonEmpty >= 0.6;
      const timeish = TIME_HEADER.test(col.label) && p.num > 0 && p.intYears / p.num > 0.8;
      if (textish || timeish) dimCount++; else break;
    }
    if (dimCount === 0) { issues.push("No label column found."); confidence -= 0.2; }
    columns.forEach((col, i) => {
      const ovRole = ov.columnRoles && ov.columnRoles[col.c];
      if (ovRole) col.role = ovRole;
      else if (i < dimCount) col.role = "dimension";
      else {
        const p = col.prof;
        col.role = p.nonEmpty === 0 || (p.num + p.dash) / p.nonEmpty >= 0.6 ? "measure" : "attribute";
        if (col.role === "measure" && p.text > 0) { issues.push(`Column "${col.label}" mixes text and numbers.`); confidence -= 0.05; }
      }
      col.additive = col.role === "measure" && !NON_ADDITIVE.test(col.label) && !/%/.test(col.prof.z || "");
    });

    const measures = columns.filter((c) => c.role === "measure");
    const val = (r, c) => { const cell = G.cellAt(grid, r, c); return cell && cell.kind === "num" ? cell.num : null; };

    // Body vs total rows.
    const bodyRows = [], totalRows = [];
    let segment = [];
    let afterGrand = false;
    const forcedTotals = ov.totalRows ? new Set(ov.totalRows) : null;
    let lastValueRow = -1;
    for (const r of allRows) if (measures.some((m) => val(r, m.c) != null)) lastValueRow = r;
    for (const r of allRows) {
      const s = rowStats(grid, r, b.c0, b.c1);
      if (s.values === 0) continue;
      const hasNums = measures.some((m) => val(r, m.c) != null);
      if (afterGrand && !hasNums) { const t = labelOf(r); if (t) notes.push(t); continue; }
      const label = labelOf(r);
      const byKeyword = TOTAL_LABEL.test(label);
      let bySum = false, mismatch = false, strongSum = false;
      const sumCheck = (rows) => {
        let match = 0, miss = 0;
        for (const m of measures) {
          if (!m.additive) continue;
          const v = val(r, m.c);
          if (v == null) continue;
          if (U.approxEqual(v, U.sum(rows.map((rr) => val(rr, m.c))))) match++; else miss++;
        }
        return { match, miss };
      };
      if (bodyRows.length >= 2) {
        const all = sumCheck(bodyRows);
        const seg = segment.length >= 2 && segment.length < bodyRows.length ? sumCheck(segment) : { match: 0, miss: 1 };
        bySum = (all.match > 0 && all.miss === 0) || (seg.match > 0 && seg.miss === 0);
        // A labelled row counts as a total by arithmetic alone only when the evidence is strong.
        strongSum = r === lastValueRow && bodyRows.length >= 3 && all.match >= 2 && all.miss === 0;
        mismatch = byKeyword && !bySum && all.match + all.miss > 0;
      }
      const isTotal = forcedTotals ? forcedTotals.has(r) : byKeyword || (bySum && (!label || dimCount === 0)) || strongSum;
      if (isTotal) {
        const segOnly = segment.length < bodyRows.length && sumCheck(segment).miss === 0 && sumCheck(bodyRows).miss > 0;
        const kind = SUBTOTAL_LABEL.test(label) && !/^grand/i.test(label) || segOnly ? "subtotal" : "grand";
        totalRows.push({ r, label: label || "Total", kind, byKeyword, bySum, mismatch });
        if (mismatch) { issues.push(`"${label}" row doesn't equal the sum of the rows above.`); confidence -= 0.15; }
        segment = [];
        if (kind === "grand") afterGrand = true;
      } else {
        bodyRows.push(r);
        segment.push(r);
      }
    }
    // Only the last grand total stays grand; earlier "grand" rows are subtotals.
    const grands = totalRows.filter((t) => t.kind === "grand");
    grands.slice(0, -1).forEach((t) => (t.kind = "subtotal"));
    const TOTAL_COL = /^(grand\s+)?totals?$/i;
    for (const col of measures) {
      if (!TOTAL_COL.test(col.label) || bodyRows.length < 2) continue;
      const others = measures.filter((m) => m !== col && m.additive && !TOTAL_COL.test(m.label));
      if (others.length < 2) continue;
      const ok = bodyRows.every((r) => { const v = val(r, col.c); return v == null || U.approxEqual(v, U.sum(others.map((m) => val(r, m.c)))); });
      if (ok && !(ov.columnRoles && ov.columnRoles[col.c])) col.role = "total";
    }
    if (!bodyRows.length) { issues.push("No data rows found."); confidence -= 0.5; }
    if (!measures.length) { issues.push("No numeric columns found."); confidence -= 0.4; }

    const lastRow = Math.max(totalRows.length ? totalRows[totalRows.length - 1].r : -1, bodyRows.length ? bodyRows[bodyRows.length - 1] : -1);
    const c0 = columns.length ? columns[0].c : b.c0, c1 = columns.length ? columns[columns.length - 1].c : b.c1;
    const r0 = headerRows.length ? headerRows[0] : dataStart;
    return {
      bannerText, notes, headerRows, dataStart, columns, bodyRows, totalRows,
      range: { r0, c0, r1: Math.max(lastRow, r0), c1 },
      confidence: U.clamp(+confidence.toFixed(2), 0, 1), issues,
    };
  }

  DV.classify = { classifyBlock, TOTAL_LABEL, NON_ADDITIVE };
})();
