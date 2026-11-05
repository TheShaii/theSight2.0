/* Stage 2: find rectangular table blocks, banner "walls", sheet titles and loose cells. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const G = DV.grid, U = DV.utils;

  // A wall is a one-row merged text cell with nothing directly beside it (banner or sheet
  // title). Walls are kept out of the flood fill so a title spanning two side-by-side
  // tables can never glue them together.
  function findWalls(grid) {
    const walls = [];
    for (const m of grid.merges) {
      const top = G.cellAt(grid, m.r0, m.c0);
      if (!top || top.kind !== "text" || m.r1 !== m.r0 || m.c1 === m.c0) continue;
      if (G.isOccupied(G.cellAt(grid, m.r0, m.c0 - 1)) || G.isOccupied(G.cellAt(grid, m.r0, m.c1 + 1))) continue;
      walls.push({ r: m.r0, c0: m.c0, c1: m.c1, text: top.text, merge: m });
    }
    return walls;
  }

  function floodComponents(grid, blocked) {
    const seen = new Uint8Array(grid.rows * grid.cols);
    const comps = [];
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const idx = r * grid.cols + c;
        if (seen[idx] || blocked.has(idx) || !G.isOccupied(grid.cells[r][c])) continue;
        const comp = { r0: r, c0: c, r1: r, c1: c, cells: 0, num: 0, text: 0 };
        const stack = [idx];
        seen[idx] = 1;
        while (stack.length) {
          const i = stack.pop(), rr = Math.floor(i / grid.cols), cc = i % grid.cols;
          const cell = grid.cells[rr][cc];
          comp.cells++;
          if (cell.kind === "num") comp.num++;
          else if (cell.kind === "text") comp.text++;
          comp.r0 = Math.min(comp.r0, rr); comp.r1 = Math.max(comp.r1, rr);
          comp.c0 = Math.min(comp.c0, cc); comp.c1 = Math.max(comp.c1, cc);
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = rr + dr, nc = cc + dc;
            if (nr < 0 || nc < 0 || nr >= grid.rows || nc >= grid.cols) continue;
            const j = nr * grid.cols + nc;
            if (seen[j] || blocked.has(j) || !G.isOccupied(grid.cells[nr][nc])) continue;
            seen[j] = 1;
            stack.push(j);
          }
        }
        comps.push(comp);
      }
    }
    return comps;
  }

  const isTableLike = (c) => c.r1 - c.r0 >= 1 && c.c1 - c.c0 >= 1 && c.num > 0 && c.text > 0;
  const overlapsCols = (a, b) => a.c0 <= b.c1 && b.c0 <= a.c1;
  const contains = (a, b) => a.r0 <= b.r0 && a.c0 <= b.c0 && a.r1 >= b.r1 && a.c1 >= b.c1;

  // A small text component directly above a table (≤1 blank row) is its banner, unless it
  // also sits over a second table (then it is a sheet-level heading).
  function attachAbove(item, tables) {
    const below = tables.filter((t) => overlapsCols(item, t) && t.r0 > item.r1 && t.r0 - item.r1 <= 2);
    if (below.length !== 1) return null;
    const t = below[0];
    const blocking = tables.some((o) => o !== t && overlapsCols(item, o) && o.r0 > item.r1 && o.r0 < t.r0);
    return blocking ? null : t;
  }

  function findBlocks(grid) {
    const walls = findWalls(grid);
    const blocked = new Set();
    for (const w of walls) for (let c = w.c0; c <= w.c1; c++) blocked.add(w.r * grid.cols + c);

    let comps = floodComponents(grid, blocked);
    // An isolated component nested inside a table's bounding box belongs to it.
    comps = comps.filter((c) => !comps.some((o) => o !== c && isTableLike(o) && contains(o, c)));

    const tables = comps.filter(isTableLike).map((c) => ({ ...c, banner: null }));
    const loose = comps.filter((c) => !isTableLike(c));
    const titles = [];

    for (const w of walls) {
      const t = attachAbove({ r0: w.r, r1: w.r, c0: w.c0, c1: w.c1 }, tables);
      if (t && !t.banner) { t.banner = { r: w.r, c: w.c0, text: w.text, merged: true }; t.r0 = Math.min(t.r0, w.r); }
      else titles.push({ r: w.r, c: w.c0, c1: w.c1, text: w.text, spansTables: !t });
    }
    // Single text cells one blank row above a table act as its banner too.
    const rest = [];
    for (const c of loose) {
      if (c.cells === 1 && c.text === 1) {
        const t = attachAbove(c, tables);
        if (t && !t.banner && t.r0 - c.r1 === 2) {
          t.banner = { r: c.r0, c: c.c0, text: grid.cells[c.r0][c.c0].text, merged: false };
          t.r0 = c.r0;
          continue;
        }
      }
      rest.push(c);
    }

    tables.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    return {
      blocks: tables.map((t) => ({ id: U.rangeStr(t.r0, t.c0, t.r1, t.c1), r0: t.r0, c0: t.c0, r1: t.r1, c1: t.c1, banner: t.banner })),
      walls: titles,
      loose: rest.map((c) => ({ r0: c.r0, c0: c.c0, r1: c.r1, c1: c.c1, cells: c.cells })),
    };
  }

  DV.blocks = { findBlocks, findWalls, floodComponents, isTableLike };
})();
