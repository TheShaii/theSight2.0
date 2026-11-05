/* Pipeline orchestrator: workbook → sheets → blocks → tables → profile → reconcile.
   Structure overrides from the review screen are applied here, never to the grid. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;

  const blockId = (b) => U.rangeStr(b.r0, b.c0, b.r1, b.c1);

  function applyBlockEdits(blocks, ov) {
    let list = blocks.map((b) => ({ ...b }));
    for (const [a, b] of ov.merges || []) {
      const x = list.find((k) => k.id === a), y = list.find((k) => k.id === b);
      if (!x || !y) continue;
      const top = x.r0 <= y.r0 ? x : y;
      const m = { r0: Math.min(x.r0, y.r0), c0: Math.min(x.c0, y.c0), r1: Math.max(x.r1, y.r1), c1: Math.max(x.c1, y.c1), banner: top.banner };
      m.id = blockId(m);
      list = list.filter((k) => k !== x && k !== y).concat(m);
    }
    for (const s of ov.splits || []) {
      const x = list.find((k) => k.id === s.blockId);
      if (!x) continue;
      const parts = s.row != null
        ? [{ ...x, r1: s.row - 1 }, { ...x, r0: s.row, banner: null }]
        : [{ ...x, c1: s.col - 1, banner: x.banner }, { ...x, c0: s.col, banner: null }];
      const valid = parts.filter((p) => p.r1 >= p.r0 && p.c1 >= p.c0);
      valid.forEach((p) => (p.id = blockId(p)));
      list = list.filter((k) => k !== x).concat(valid);
    }
    for (const a of ov.added || []) {
      const n = { ...a, banner: null };
      n.id = blockId(n);
      list = list.filter((k) => !(k.r0 >= n.r0 && k.c0 >= n.c0 && k.r1 <= n.r1 && k.c1 <= n.c1)).concat(n);
    }
    return list.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
  }

  function detectMode(tables) {
    const anyTotals = tables.some((t) => t.meta.hasGrandTotal || t.totals.subtotals.length);
    if (anyTotals || tables.length > 1) return "summary";
    if (tables.length === 1 && tables[0].rows.length > 50) return "flat";
    return "summary";
  }

  // Pass the cached grid when re-running after review fixes: Stage 1 never repeats.
  function analyzeSheet(name, ws, ov, cachedGrid) {
    ov = ov || {};
    const grid = cachedGrid || DV.grid.sheetToGrid(ws);
    const found = DV.blocks.findBlocks(grid);
    const blocks = applyBlockEdits(found.blocks, ov);
    const context = DV.params.extractContext(grid, { ...found, blocks }, name);
    const tables = [], skipped = [];
    for (const b of blocks) {
      const bo = (ov.blocks || {})[b.id] || {};
      if (bo.notTable) { skipped.push({ id: b.id, reason: "notTable" }); continue; }
      const cls = DV.classify.classifyBlock(grid, b, bo);
      if (!cls.bodyRows.length || !cls.columns.some((c) => c.role === "measure")) { skipped.push({ id: b.id, reason: "empty", cls }); continue; }
      const t = DV.tables.buildTable(name, grid, b, cls, bo);
      DV.profiler.profileTable(t, bo);
      t.hidden = !!bo.hidden;
      tables.push(t);
    }
    // Flat data: keep the raw table (data view, filters) and add summed-up summary tables.
    const mode = ov.mode || detectMode(tables);
    if (mode === "flat") {
      const raw = tables[0];
      raw.meta.structure = "flat";
      raw.title = raw.autoTitle = `${name}: all ${raw.rows.length.toLocaleString("en-US")} rows`;
      for (const sum of DV.flat.summaries(raw, name)) { DV.profiler.profileTable(sum, {}); tables.push(sum); }
    }
    // A lone table whose banner was the sheet heading: use it as the dashboard title.
    if (context.title === name && (tables.length === 1 || mode === "flat") && tables[0].autoTitle && mode !== "flat") context.title = tables[0].autoTitle;
    const recon = DV.reconcile.reconcileSheet(tables);
    return {
      name, grid, blocks, found, tables, skipped,
      title: context.title, subtitle: context.subtitle, notes: context.notes, params: context.params,
      titleCells: context.titleCells,
      reconcile: recon,
      mode,
      warnings: grid.warnings.slice(),
      lowConfidence: tables.filter((t) => t.meta.confidence < 0.7).map((t) => t.id),
    };
  }

  function analyzeWorkbook(wb, overrides) {
    overrides = overrides || {};
    const sheets = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) continue;
      const s = analyzeSheet(name, ws, overrides[name]);
      if (s.tables.length || s.params.length || s.skipped.length) sheets.push(s);
    }
    return sheets;
  }

  DV.analyze = { analyzeWorkbook, analyzeSheet, applyBlockEdits, detectMode };
})();
