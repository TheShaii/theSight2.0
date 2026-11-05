/* Stage 4: sheet title / subtitle / notes and loose "Label | Value" parameter cells. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const G = DV.grid;

  const isLabel = (cell) => cell && cell.kind === "text" && cell.text.length <= 48;
  const cleanLabel = (t) => t.replace(/\s*[:=]\s*$/, "");
  const valueOf = (cell) => (cell.kind === "num" ? cell.num : cell.kind === "date" ? cell.text : cell.text);
  const displayOf = (cell) => (cell.kind === "num" && cell.z === "General" ? String(cell.num) : cell.w || cell.text);

  function valuesIn(grid, comp) {
    const out = [];
    for (let r = comp.r0; r <= comp.r1; r++)
      for (let c = comp.c0; c <= comp.c1; c++) {
        const cell = G.cellAt(grid, r, c);
        if (G.hasValue(cell)) out.push({ r, c, cell });
      }
    return out;
  }

  function extractContext(grid, found, sheetName) {
    const params = [], texts = [];
    for (const comp of found.loose) {
      const vals = valuesIn(grid, comp);
      const rows = comp.r1 - comp.r0 + 1, cols = comp.c1 - comp.c0 + 1;
      // Label | Value pairs laid out horizontally (one or more stacked rows).
      if (cols === 2 && vals.length === rows * 2 && vals.every((v) => v.c !== comp.c0 || isLabel(v.cell))) {
        for (let r = comp.r0; r <= comp.r1; r++) {
          const l = grid.cells[r][comp.c0], v = grid.cells[r][comp.c1];
          params.push({ label: cleanLabel(l.text), value: valueOf(v), display: displayOf(v), r, c: comp.c0 });
        }
        continue;
      }
      // Label above value, only when the label clearly reads as one.
      if (rows === 2 && cols === 1 && vals.length === 2 && isLabel(vals[0].cell) &&
          (vals[1].cell.kind !== "text" || /[:=]$/.test(vals[0].cell.text))) {
        params.push({ label: cleanLabel(vals[0].cell.text), value: valueOf(vals[1].cell), display: displayOf(vals[1].cell), r: comp.r0, c: comp.c0 });
        continue;
      }
      for (const v of vals) if (v.cell.kind === "text") texts.push({ r: v.r, c: v.c, text: v.cell.text });
    }
    for (const w of found.walls) texts.push({ r: w.r, c: w.c, text: w.text });
    texts.sort((a, b) => a.r - b.r || a.c - b.c);

    const firstTable = found.blocks.length ? Math.min(...found.blocks.map((b) => b.r0)) : Infinity;
    const above = texts.filter((t) => t.r < firstTable);
    const title = above[0] ? above[0].text : sheetName;
    const subtitle = above[1] ? above[1].text : "";
    const notes = texts.filter((t) => !above.slice(0, 2).includes(t)).map((t) => t.text);
    return { title, subtitle, notes, params, titleCells: above.slice(0, 2) };
  }

  DV.params = { extractContext };
})();
